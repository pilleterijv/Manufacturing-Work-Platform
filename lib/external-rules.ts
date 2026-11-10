import { inflateRawSync, crc32 } from "node:zlib";
import { z } from "zod";
export const feedSections = [
  "Overview",
  "Standard work",
  "DL/TL Standard Work",
  "Time studies",
  "Training",
  "Troubleshooting",
  "Analytics",
  "Downtime",
  "Leadership dashboard",
  "Improvement ideas",
  "Problem solving",
  "Preventive maintenance",
  "Production results",
  "Shift requirements",
] as const;
export const feedCapabilities: Record<string, string> = {
  "Standard work": "work",
  "DL/TL Standard Work": "audits",
  "Time studies": "studies",
  Analytics: "analytics",
  "Production results": "analytics",
  Downtime: "downtime",
  "Leadership dashboard": "leadership",
  "Improvement ideas": "ideas",
  "Problem solving": "problems",
  "Preventive maintenance": "maintenance",
  "Shift requirements": "manage",
};
export const externalRowSchema = z
  .object({
    externalId: z.string().trim().min(1).max(150),
    equipmentId: z.string().uuid(),
    personId: z.string().uuid().nullable().default(null),
    title: z.string().trim().min(1).max(150),
    details: z.string().max(10000).default(""),
    occurredAt: z.iso.datetime(),
    values: z
      .record(
        z.string().max(100),
        z.union([
          z.string().max(2000),
          z.number().finite(),
          z.boolean(),
          z.null(),
        ]),
      )
      .refine((v) => Object.keys(v).length <= 30, "Maximum 30 fields")
      .default({}),
  })
  .strict();
export const feedIdentifier = (view: string) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}\.[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(view))
    throw Error("Use an approved schema.view name");
  return view;
};
export function validateWorkbookZip(bytes: Buffer) {
  if (bytes.length > 8 * 1024 * 1024)
    throw Error("Workbook must be under 8 MB");
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end < bytes.length - 65557 || end + 22 > bytes.length)
    throw Error("Choose a valid XLSX workbook");
  const count = bytes.readUInt16LE(end + 10),
    offset = bytes.readUInt32LE(end + 16);
  if (
    bytes.readUInt16LE(end + 4) ||
    bytes.readUInt16LE(end + 6) ||
    count > 2000 ||
    count === 65535
  )
    throw Error("Unsupported workbook archive");
  let at = offset,
    total = 0,
    actualTotal = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== 0x02014b50)
      throw Error("Invalid workbook archive");
    const size = bytes.readUInt32LE(at + 24),
      n = bytes.readUInt16LE(at + 28),
      extra = bytes.readUInt16LE(at + 30),
      comment = bytes.readUInt16LE(at + 32);
    if (at + 46 + n + extra + comment > end)
      throw Error("Invalid workbook directory");
    total += size;
    if (size === 0xffffffff || total > 32 * 1024 * 1024)
      throw Error("Workbook expands beyond 32 MB");
    const name = bytes.toString("utf8", at + 46, at + 46 + n);
    if (/vbaProject|externalLinks|\.bin$/i.test(name))
      throw Error("Macros and external links are not accepted");
    const method = bytes.readUInt16LE(at + 10),
      flags = bytes.readUInt16LE(at + 8),
      compressedSize = bytes.readUInt32LE(at + 20),
      local = bytes.readUInt32LE(at + 42);
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      local + 30 > offset ||
      bytes.readUInt32LE(local) !== 0x04034b50
    )
      throw Error("Unsupported workbook entry");
    const localName = bytes.readUInt16LE(local + 26),
      localExtra = bytes.readUInt16LE(local + 28),
      start = local + 30 + localName + localExtra;
    if (
      start + compressedSize > offset ||
      bytes.toString("utf8", local + 30, local + 30 + localName) !== name
    )
      throw Error("Invalid workbook entry");
    if (
      name.split("/").includes("..") ||
      name.includes("\\") ||
      name.includes("\0")
    )
      throw Error("Invalid workbook path");
    const packed = bytes.subarray(start, start + compressedSize);
    let expanded: Buffer;
    try {
      expanded =
        method === 0
          ? packed
          : inflateRawSync(packed, {
              maxOutputLength: Math.max(1, 32 * 1024 * 1024 - actualTotal),
            });
    } catch {
      throw Error("Workbook data is invalid or expands beyond 32 MB");
    }
    actualTotal += expanded.length;
    if (
      expanded.length !== size ||
      actualTotal > 32 * 1024 * 1024 ||
      crc32(expanded) !== bytes.readUInt32LE(at + 16)
    )
      throw Error("Workbook size or checksum is invalid");
    at += 46 + n + extra + comment;
  }
  if (!count) throw Error("Empty workbook archive");
}
