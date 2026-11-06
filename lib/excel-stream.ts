import type ExcelJS from "exceljs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { HttpError } from "./http-error";
export type ExportSheet = {
  addRow(values: ExcelJS.CellValue[]): Promise<void>;
};
export type ExportBook = {
  addWorksheet(name: string): ExportSheet;
  check(): void;
};
export { paged } from "./paged";
let active = 0;
const MAX_BYTES = 256 * 1024 * 1024;
// Disk-backed sheets prevent ExcelJS retaining later sheets while ZIP writes
// its first sheet. A slow client reads only the completed file, with native
// read-stream backpressure; there is no unbounded HTTP/ZIP buffering queue.
export async function streamWorkbook(
  filename: string,
  produce: (book: ExportBook) => Promise<void>,
  signal?: AbortSignal,
) {
  if (active >= 1)
    throw new HttpError(
      429,
      "An export is already running. Try again shortly.",
    );
  active++;
  let folder: string | undefined;
  let released = false;
  let output: ReturnType<typeof createWriteStream> | undefined;
  let archive:
    | {
        abort(): unknown;
        on(event: string, listener: (value: any) => void): unknown;
        removeListener(event: string, listener: (value: any) => void): unknown;
      }
    | undefined;
  const sheets: {
    name: string;
    file: string;
    handle: Awaited<ReturnType<typeof open>>;
  }[] = [];
  const cleanup = async () => {
    if (released) return;
    released = true;
    await Promise.allSettled(sheets.map((s) => s.handle.close()));
    try {
      if (folder) await rm(folder, { recursive: true, force: true });
    } finally {
      active--;
    }
  };
  try {
    folder = await mkdtemp(path.join(tmpdir(), "floorwork-export-"));
    let total = 0;
    const check = () => {
      if (signal?.aborted) throw new HttpError(499, "Export cancelled");
    };
    // Open spool handles lazily: worksheet creation remains synchronous.
    const pending = new Map<
      number,
      Promise<Awaited<ReturnType<typeof open>>>
    >();
    const names: string[] = [];
    const book: ExportBook = {
      check,
      addWorksheet(name) {
        const index = names.length;
        names.push(name);
        const file = path.join(folder!, `${index}.jsonl`);
        const handle = open(file, "wx", 0o600).then((handle) => {
          sheets.push({ name, file, handle });
          return handle;
        });
        void handle.catch(() => {});
        pending.set(index, handle);
        return {
          async addRow(values) {
            check();
            const line =
              JSON.stringify(
                values.map((v) =>
                  v instanceof Date ? { $date: v.toISOString() } : v,
                ),
              ) + "\n";
            total += Buffer.byteLength(line);
            if (total > MAX_BYTES)
              throw new HttpError(
                413,
                "Export is too large. Use a narrower report or ask your administrator for an archive.",
              );
            await (await pending.get(index)!).writeFile(line);
          },
        };
      },
    };
    try {
      await produce(book);
    } finally {
      await Promise.allSettled(pending.values());
    }
    check();
    await Promise.all(sheets.map((s) => s.handle.close()));
    const result = path.join(folder, "export.xlsx");
    const stream = createWriteStream(result, { flags: "wx", mode: 0o600 });
    output = stream;
    const ExcelJS = (await import("exceljs")).default;
    const writer = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream,
      useSharedStrings: false,
      useStyles: true,
    });
    archive = (writer as unknown as { zip: NonNullable<typeof archive> }).zip;
    // Guard the file stream's error event until the writer attaches listeners.
    let diskError: Error | undefined;
    stream.on("error", (error) => {
      diskError = error;
    });
    archive.on("error", (error) => {
      diskError = error;
    });
    for (const name of names) {
      const source = sheets.find((s) => s.name === name)!;
      const sheet = writer.addWorksheet(name, {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      let count = 0;
      const input = createReadStream(source.file);
      const lines = createInterface({ input, crlfDelay: Infinity });
      try {
        for await (const line of lines) {
          check();
          if (diskError) throw diskError;
          const values = JSON.parse(line).map((v: unknown) =>
            v && typeof v === "object" && "$date" in v
              ? new Date(String(v.$date))
              : v,
          );
          if (count === 0) sheet.columns = values.map(() => ({ width: 24 }));
          const row = sheet.addRow(values);
          if (count === 0) {
            row.font = { bold: true, color: { argb: "FFFFFFFF" } };
            row.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FF153E41" },
            };
          }
          row.commit();
          if (++count % 100 === 0)
            await new Promise<void>((resolve) => setImmediate(resolve));
        }
        // Wait for this ZIP entry to finish before opening the next worksheet.
        // ExcelJS commits rows but otherwise permits later sheets to buffer.
        const entryDone = new Promise<void>((resolve, reject) => {
          const done = () => {
            archive!.removeListener("entry", entry);
            archive!.removeListener("error", failed);
            signal?.removeEventListener("abort", cancelled);
          };
          const entry = (value: { name: string }) => {
            if (value.name === `xl/worksheets/sheet${sheet.id}.xml`) {
              done();
              resolve();
            }
          };
          const failed = (error: Error) => {
            done();
            reject(error);
          };
          const cancelled = () =>
            failed(new HttpError(499, "Export cancelled"));
          archive!.on("entry", entry);
          archive!.on("error", failed);
          signal?.addEventListener("abort", cancelled, { once: true });
        });
        sheet.commit();
        await entryDone;
      } finally {
        lines.close();
        input.destroy();
      }
    }
    await writer.commit();
    check();
    const download = createReadStream(result, { highWaterMark: 64 * 1024 });
    download.once("close", () => {
      void cleanup();
    });
    return new Response(
      Readable.toWeb(download) as ReadableStream<Uint8Array>,
      {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    archive?.abort();
    output?.destroy();
    await cleanup();
    throw error;
  }
}
