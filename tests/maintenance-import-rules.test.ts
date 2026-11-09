import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextMaintenanceDate,
  maintenanceSchema,
} from "../lib/maintenance-rules";
import {
  feedIdentifier,
  externalRowSchema,
  validateWorkbookZip,
} from "../lib/external-rules";
import { recordFilters } from "../lib/filters";
test("PM next dates advance on calendar days and skip missed periods without drift", () => {
  assert.equal(
    nextMaintenanceDate("2026-10-01", "2026-11-09", 30),
    "2026-11-30",
  );
  assert.equal(
    nextMaintenanceDate("2026-11-09", "2026-11-09", 1),
    "2026-11-10",
  );
  assert.equal(
    nextMaintenanceDate("2028-02-28", "2028-02-28", 1),
    "2028-02-29",
  );
});
test("external views reject SQL syntax and row payloads cannot carry account or permission writes", () => {
  assert.equal(feedIdentifier("dbo.FloorworkResults"), "dbo.FloorworkResults");
  assert.throws(() => feedIdentifier("dbo.Results; DROP TABLE users"));
  assert.throws(() => feedIdentifier("dbo.Results WHERE 1=1"));
  assert(
    !externalRowSchema.safeParse({
      externalId: "e",
      equipmentId: crypto.randomUUID(),
      title: "Result",
      occurredAt: new Date().toISOString(),
      role: "Admin",
    }).success,
  );
});
test("workbook guard rejects non-XLSX and oversized archives before decompression", () => {
  assert.throws(() =>
    validateWorkbookZip(Buffer.from("<html>not a workbook</html>")),
  );
  assert.throws(() => validateWorkbookZip(Buffer.alloc(8 * 1024 * 1024 + 1)));
});
test("person/text filters intersect existing scopes and use case insensitive title matching", () => {
  const f = recordFilters(crypto.randomUUID(), "PACKING");
  assert(f.userId);
  assert(f.OR?.some((x) => (x.data as any)?.mode === "insensitive"));
});

test("workbook inflation is bounded even when ZIP metadata lies about expanded size", async () => {
  const { deflateRawSync, crc32 } = await import("node:zlib");
  const content = Buffer.alloc(33 * 1024 * 1024, 65),
    packed = deflateRawSync(content),
    name = Buffer.from("xl/worksheets/sheet1.xml");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc32(content), 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(1, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc32(content), 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(1, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + packed.length, 16);
  assert.throws(
    () =>
      validateWorkbookZip(
        Buffer.concat([local, name, packed, central, name, end]),
      ),
    /32 MB/,
  );
});
