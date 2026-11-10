import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { allowedDowntimeEquipment } from "./downtime-access-rules";
import { HttpError } from "./http-error";
import type { ScopedUser } from "./location-access";
export const allowedArea = (
  u: ScopedUser,
  area: { plant: string; department: string; area: string },
) => allowedDowntimeEquipment(u.role, u.workspaceAccess, { ...area, id: "" });
export async function visibleAreas(
  u: ScopedUser,
  tx: Prisma.TransactionClient = db,
) {
  return (
    await tx.location.findMany({
      where: { active: true },
      orderBy: [{ plant: "asc" }, { department: "asc" }, { area: "asc" }],
    })
  ).filter((l) => allowedArea(u, l));
}
export async function assertAreaAccess(
  u: ScopedUser,
  id: string,
  tx: Prisma.TransactionClient = db,
) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${u.id} FOR SHARE`;
  const fresh = await tx.user.findUniqueOrThrow({ where: { id: u.id } }),
    l = await tx.location.findUnique({ where: { id } });
  if (!fresh.active || !l?.active || !allowedArea(fresh, l))
    throw new HttpError(
      403,
      "This area is outside your assigned departments and areas",
    );
  return l;
}
