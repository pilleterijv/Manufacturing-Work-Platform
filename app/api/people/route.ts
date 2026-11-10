import { visibleAreas, allowedArea } from "@/lib/area-access";
import { db } from "@/lib/db";
import { requireUser, failure } from "@/lib/security";
import { equipmentIds } from "@/lib/location-access";
import { allowedDowntimeEquipment } from "@/lib/downtime-access-rules";
export async function GET(req: Request) {
  try {
    const u = await requireUser(),
      ids = await equipmentIds(u),
      eq = await db.equipment.findMany({ where: { id: { in: ids } } });
    const areas = await visibleAreas(u);
    const query =
      new URL(req.url).searchParams
        .get("search")
        ?.slice(0, 150)
        .toLowerCase() ?? "";
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
            u.role === "Admin" ||
            p.id === u.id ||
            areas.some((l) => allowedArea(p, l)) ||
            eq.some((e) =>
              allowedDowntimeEquipment(p.role, p.workspaceAccess, e),
            ),
        )
        .filter(
          (p) =>
            !query || `${p.name} ${p.username}`.toLowerCase().includes(query),
        )
        .map(({ workspaceAccess, ...p }) => p),
    });
  } catch (e) {
    return failure(e);
  }
}
