import { db } from "@/lib/db";
import { requireUser, grants, failure } from "@/lib/security";
import { assertEquipmentAccess } from "@/lib/location-access";
import { z } from "zod";
export async function GET(req: Request) {
  try {
    const u = await requireUser(),
      g = await grants(u),
      id = z
        .string()
        .uuid()
        .parse(new URL(req.url).searchParams.get("equipment"));
    await assertEquipmentAccess(u, id);
    const [defects, problems] = await Promise.all([
      g.includes("defects")
        ? db.defect.findMany({
            where: { equipmentId: id, status: "Open" },
            select: { id: true, title: true },
            take: 10,
            orderBy: { createdAt: "desc" },
          })
        : [],
      g.includes("problems")
        ? db.problem.findMany({
            where: { equipmentId: id, status: { not: "Closed" } },
            select: { id: true, title: true, reference: true },
            take: 10,
            orderBy: { createdAt: "desc" },
          })
        : [],
    ]);
    return Response.json({ defects, problems });
  } catch (e) {
    return failure(e);
  }
}
