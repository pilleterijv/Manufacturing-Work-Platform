import ExcelJS from "exceljs";
import { requireUser, failure } from "@/lib/security";
import { equipmentIds, visiblePeople } from "@/lib/location-access";
import { db } from "@/lib/db";
export async function GET() {
  try {
    const u = await requireUser("manage"),
      ids = await equipmentIds(u),
      book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet("Production Results"),
      equipment = book.addWorksheet("Machine IDs"),
      people = book.addWorksheet("Person IDs");
    sheet.addRow([
      "ExternalID",
      "EquipmentID",
      "Date",
      "Produced",
      "Good",
      "Rejects",
      "PersonID",
    ]);
    equipment.addRow([
      "EquipmentID",
      "Machine",
      "Plant",
      "Department",
      "Area",
      "Line",
    ]);
    for (const e of await db.equipment.findMany({ where: { id: { in: ids } } }))
      equipment.addRow([e.id, e.name, e.plant, e.department, e.area, e.line]);
    people.addRow(["PersonID", "Name", "Username"]);
    for (const p of await visiblePeople(u, ids))
      people.addRow([p.id, p.name, p.username]);
    const bytes = await book.xlsx.writeBuffer();
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          "attachment; filename=floorwork-production-template.xlsx",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
