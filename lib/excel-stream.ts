import ExcelJS from "exceljs";
import { PassThrough, Readable } from "node:stream";
export type ExportSheet = { addRow(values: ExcelJS.CellValue[]): void };
export type ExportBook = {
  addWorksheet(name: string): ExportSheet;
  check(): void;
};
export async function* paged<T extends { id: string }>(
  load: (cursor: string | undefined) => Promise<T[]>,
) {
  let cursor: string | undefined;
  while (true) {
    const batch = await load(cursor);
    if (!batch.length) return;
    for (const row of batch) yield row;
    cursor = batch[batch.length - 1].id;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
export function streamWorkbook(
  filename: string,
  produce: (book: ExportBook) => Promise<void>,
) {
  const output = new PassThrough({ highWaterMark: 64 * 1024 });
  const writer = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: output,
    useSharedStrings: false,
    useStyles: true,
  });
  const check = () => {
    if (output.destroyed) throw Error("Export download closed");
  };
  const book: ExportBook = {
    check,
    addWorksheet(name) {
      check();
      const sheet = writer.addWorksheet(name, {
        views: [{ state: "frozen", ySplit: 1 }],
      });
      let header = true;
      return {
        addRow(values) {
          check();
          if (header) sheet.columns = values.map(() => ({ width: 24 }));
          const row = sheet.addRow(values);
          if (header) {
            row.font = { bold: true, color: { argb: "FFFFFFFF" } };
            row.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FF153E41" },
            };
            header = false;
          }
          row.commit();
        },
      };
    },
  };
  const body = Readable.toWeb(output) as ReadableStream<Uint8Array>;
  void produce(book)
    .then(() => writer.commit())
    .catch((error) => {
      console.error(
        "Export interrupted",
        error instanceof Error ? error.name : "unknown",
      );
      output.destroy(error instanceof Error ? error : Error("Export failed"));
    });
  return new Response(body, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
