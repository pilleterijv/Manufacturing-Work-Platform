import { db } from "@/lib/db";
import { z } from "zod";
import ExcelJS from "exceljs";
import {
  requireUser,
  jsonBody,
  failure,
  HttpError,
  limit,
} from "@/lib/security";
import { equipmentIds } from "@/lib/location-access";
import { validateWorkbookZip } from "@/lib/external-rules";
import { ingestExternalRows } from "@/lib/external-data";
let processing = false;
export async function POST(req: Request) {
  let slot = false;
  try {
    const u = await requireUser("manage");
    await limit("excel-import:" + u.id, 10, 3600);
    if (processing)
      throw new HttpError(
        429,
        "Another workbook is being processed; retry shortly",
      );
    processing = true;
    slot = true;
    const b = z
      .object({
        feedId: z.string().uuid(),
        workbook: z.string().max(12 * 1024 * 1024),
      })
      .parse(await jsonBody(req, 12 * 1024 * 1024));
    const feed = await db.externalFeed.findUnique({ where: { id: b.feedId } });
    if (feed?.mode !== "excel")
      throw new HttpError(403, "Choose an Excel import feed");
    const m = b.workbook.match(
      /^data:application\/[\w.+-]+;base64,([A-Za-z0-9+/=]+)$/,
    );
    if (!m) throw new HttpError(400, "Choose an XLSX file");
    const bytes = Buffer.from(m[1], "base64");
    try {
      validateWorkbookZip(bytes);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const book = new ExcelJS.Workbook();
    try {
      await book.xlsx.load(bytes as any);
    } catch {
      throw new HttpError(400, "Workbook cannot be read");
    }
    const sheet = book.getWorksheet("Production Results") ?? book.worksheets[0];
    if (!sheet || sheet.rowCount > 1001)
      throw new HttpError(400, "Use one header row and at most 1000 data rows");
    const names = [
        "ExternalID",
        "EquipmentID",
        "Date",
        "Produced",
        "Good",
        "Rejects",
        "PersonID",
      ],
      headers = sheet.getRow(1).values as any[];
    if (
      new Set(headers.filter((v) => v != null)).size !==
      headers.filter((v) => v != null).length
    )
      throw new HttpError(400, "Workbook headers must be unique");
    if (names.slice(0, 6).some((n) => !headers.includes(n)))
      throw new HttpError(
        400,
        "Required headers: ExternalID, EquipmentID, Date, Produced, Good, Rejects; optional PersonID",
      );
    const rows = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      if (!row.hasValues) continue;
      const values: Record<string, unknown> = {};
      for (const n of names) {
        const col = headers.indexOf(n);
        const v = col > 0 ? row.getCell(col).value : null;
        if (v && typeof v === "object" && !(v instanceof Date))
          throw new HttpError(
            400,
            `Row ${i}: formulas, hyperlinks and rich text are not accepted`,
          );
        values[n] = v;
      }
      if (
        typeof values.ExternalID === "number" &&
        !Number.isSafeInteger(values.ExternalID)
      )
        throw new HttpError(
          400,
          `Row ${i}: store long ExternalID values as text to preserve precision`,
        );
      const date =
        values.Date instanceof Date
          ? values.Date.toISOString()
          : String(values.Date);
      const occurredAt = /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date + "T00:00:00.000Z"
        : date;
      const quantity = z.number().int().nonnegative().max(1e12),
        produced = quantity.parse(values.Produced),
        good = quantity.parse(values.Good),
        rejects = quantity.parse(values.Rejects);
      if (good + rejects !== produced)
        throw new HttpError(
          400,
          `Row ${i}: Good + Rejects must equal Produced`,
        );
      rows.push({
        externalId: String(values.ExternalID ?? ""),
        equipmentId: String(values.EquipmentID ?? ""),
        personId: values.PersonID ? String(values.PersonID) : null,
        title: "Production results · " + date.slice(0, 10),
        details: `Produced ${produced}; good ${good}; rejects ${rejects}`,
        occurredAt,
        values: { produced, good, rejects },
      });
    }
    return Response.json(
      await ingestExternalRows(
        b.feedId,
        rows,
        undefined,
        await equipmentIds(u),
      ),
    );
  } catch (e) {
    return failure(e);
  } finally {
    if (slot) processing = false;
  }
}
