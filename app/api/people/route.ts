import { db } from "@/lib/db";
import { requireUser, failure } from "@/lib/security";
import { equipmentIds } from "@/lib/location-access";
import { allowedDowntimeEquipment } from "@/lib/downtime-access-rules";
export async function GET() {
  try {
    const u = await requireUser(),
      ids = await equipmentIds(u),
      eq = await db.equipment.findMany({ where: { id: { in: ids } } });
    const people = await db.user.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        active: true,
        role: true,
        workspaceAccess: true,
      },
      orderBy: { name: "asc" },
    });
    return Response.json({
      people: people
        .filter(
          (p) =>
            p.id === u.id ||
            eq.some((e) =>
              allowedDowntimeEquipment(p.role, p.workspaceAccess, e),
            ),
        )
        .map(({ workspaceAccess, ...p }) => p),
    });
  } catch (e) {
    return failure(e);
  }
}
