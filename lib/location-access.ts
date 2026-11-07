import { Prisma, type User } from "@prisma/client";
import { db } from "./db";
import { downtimeEquipmentWhere } from "./downtime-access";
import { allowedDowntimeEquipment } from "./downtime-access-rules";
import { HttpError } from "./http-error";
export type ScopedUser = Pick<User, "id" | "role" | "workspaceAccess">;
export function equipmentScope(u: ScopedUser): Prisma.EquipmentWhereInput {
  return downtimeEquipmentWhere({
    role: u.role,
    downtimeAccess: u.workspaceAccess,
  });
}
export async function equipmentIds(u: ScopedUser) {
  return (
    await db.equipment.findMany({
      where: equipmentScope(u),
      select: { id: true },
    })
  ).map((e) => e.id);
}
export function recordScope(ids: string[]): Prisma.RecordWhereInput {
  return {
    OR: [
      { standard: { equipmentId: { in: ids } } },
      ...ids.map((id) => ({ data: { path: ["equipmentId"], equals: id } })),
    ],
  };
}
export async function assertEquipmentAccess(
  u: ScopedUser,
  id: string,
  tx: Prisma.TransactionClient = db,
) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${u.id} FOR SHARE`;
  const fresh = await tx.user.findUniqueOrThrow({ where: { id: u.id } });
  const eq = await tx.equipment.findUnique({ where: { id } });
  if (
    !fresh.active ||
    !eq ||
    !allowedDowntimeEquipment(fresh.role, fresh.workspaceAccess, eq)
  )
    throw new HttpError(
      403,
      "This equipment is outside your assigned departments and areas",
    );
  return eq;
}
export async function eligiblePeople(
  equipmentId: string,
  ids: string[],
  tx: Prisma.TransactionClient = db,
) {
  const eq = await tx.equipment.findUniqueOrThrow({
    where: { id: equipmentId },
  });
  const people = await tx.user.findMany({
    where: { id: { in: [...new Set(ids)] }, active: true },
  });
  if (
    people.length !== new Set(ids).size ||
    people.some((p) => !allowedDowntimeEquipment(p.role, p.workspaceAccess, eq))
  )
    throw new HttpError(
      400,
      "Every assignee must be active and assigned to this department, area or machine",
    );
}
export async function visiblePeople(u: ScopedUser, ids: string[]) {
  const equipment = await db.equipment.findMany({ where: { id: { in: ids } } });
  const people = await db.user.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  return people.filter(
    (p) =>
      p.id === u.id ||
      equipment.some((e) =>
        allowedDowntimeEquipment(p.role, p.workspaceAccess, e),
      ),
  );
}
export const equipmentSql = (ids: string[], column: Prisma.Sql) =>
  Prisma.sql`${column} = ANY(${ids}::text[])`;
export async function notificationScope(
  u: ScopedUser,
  ids: string[],
): Promise<Prisma.NotificationWhereInput> {
  const schedules = await db.workSchedule.findMany({
    where: { equipmentId: { in: ids } },
    select: { id: true },
  });
  const checks = await db.shiftCheck.findMany({
    where: { scheduleId: { in: schedules.map((s) => s.id) } },
    select: { id: true },
  });
  return {
    userId: u.id,
    OR: [
      { idea: { equipmentId: { in: ids } } },
      { kind: "missed-work", sourceId: { in: checks.map((c) => c.id) } },
    ],
  };
}
