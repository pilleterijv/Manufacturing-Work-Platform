import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { streamWorkbook } from "../lib/excel-stream";
const staged = async () =>
  new Set(
    (await readdir(tmpdir())).filter((n) => n.startsWith("floorwork-export-")),
  );
const waitCleanup = async (before: Set<string>) => {
  for (let i = 0; i < 100; i++) {
    if ((await staged()).size === before.size) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.deepEqual(
    await staged(),
    before,
    "Private export files were not removed",
  );
};
test("disk-backed multi-sheet exports retain every row and typed dates, and clean up after slow reads", async () => {
  const before = await staged();
  const response = await streamWorkbook("test.xlsx", async (book) => {
    const a = book.addWorksheet("First"),
      b = book.addWorksheet("Second");
    await a.addRow(["ID", "Date"]);
    await b.addRow(["ID", "Description"]);
    for (let i = 0; i < 1200; i++) {
      await a.addRow([i, new Date("2026-11-02T10:00:00Z")]);
      await b.addRow([i, "Text " + i]);
    }
  });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  await assert.rejects(
    () => streamWorkbook("busy.xlsx", async () => {}),
    /already running/,
  );
  const chunks: Uint8Array[] = [];
  const reader = response.body!.getReader();
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    chunks.push(r.value);
    await new Promise((r) => setTimeout(r, 5));
  }
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.concat(chunks) as any);
  assert.equal(book.worksheets[0].rowCount, 1201);
  assert.equal(book.worksheets[1].rowCount, 1201);
  assert.equal(book.worksheets[1].getRow(1201).getCell(1).value, 1199);
  assert(book.worksheets[0].getRow(2).getCell(2).value instanceof Date);
  await waitCleanup(before);
});
test("cancelled and failed exports release their slot and private temporary files", async () => {
  const before = await staged();
  await assert.rejects(
    () =>
      streamWorkbook("bad.xlsx", async (book) => {
        await book.addWorksheet("Data").addRow(["private"]);
        throw Error("fixture");
      }),
    /fixture/,
  );
  await waitCleanup(before);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(
    () =>
      streamWorkbook(
        "cancelled.xlsx",
        async (book) => {
          await book.addWorksheet("Data").addRow([1]);
        },
        cancelled.signal,
      ),
    /cancelled/,
  );
  const response = await streamWorkbook("close.xlsx", async (book) => {
    await book.addWorksheet("Data").addRow([1]);
  });
  await response.body!.cancel();
  await waitCleanup(before);
});
