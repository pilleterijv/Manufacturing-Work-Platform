import { db } from "@/lib/db";
import { requireUser, failure } from "@/lib/security";
import { equipmentScope } from "@/lib/location-access";
import { equipmentLabel } from "@/lib/equipment-label";
export async function GET() {
  try {
    const u = await requireUser();
    const equipment = await db.equipment.findMany({
      where: equipmentScope(u),
      orderBy: [
        { plant: "asc" },
        { department: "asc" },
        { area: "asc" },
        { line: "asc" },
        { name: "asc" },
        { id: "asc" },
      ],
    });
    return Response.json({
      equipment: equipment.map((e) => ({ ...e, label: equipmentLabel(e) })),
    });
  } catch (e) {
    return failure(e);
  }
}
