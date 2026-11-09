import { grants } from "./capabilities";
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
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      active: true,
      email: true,
      workspaceAccess: true,
    },
    orderBy: { name: "asc" },
  });
  return people
    .filter(
      (p) =>
        p.id === u.id ||
        equipment.some((e) =>
          allowedDowntimeEquipment(p.role, p.workspaceAccess, e),
        ),
    )
    .map(({ id, name, username, role, active, email }) => ({
      id,
      name,
      username,
      role,
      active,
      hasEmail: !!email,
    }));
}
export const equipmentSql = (ids: string[], column: Prisma.Sql) =>
  Prisma.sql`${column} = ANY(${ids}::text[])`;
export async function notificationScope(
  u: ScopedUser,
  ids: string[],
): Promise<Prisma.NotificationWhereInput> {
  const g = await grants(u),
    types = [
      ...(g.includes("ideas") ? ["idea"] : []),
      ...(g.includes("problems") ? ["problem", "action"] : []),
      ...(g.includes("maintenance") ? ["pm"] : []),
    ];
  const notices = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT n.id FROM "Notification" n
    LEFT JOIN "Idea" i ON i.id=n."ideaId"
    LEFT JOIN "ShiftCheck" c ON c.id=n."sourceId" AND n.kind='missed-work'
    LEFT JOIN "WorkSchedule" s ON s.id=c."scheduleId"
    LEFT JOIN "Reminder" m ON m.id=n."sourceId" AND n.kind='overdue'
    WHERE n."userId"=${u.id}
    AND (i."equipmentId"=ANY(${ids}::text[]) OR s."equipmentId"=ANY(${ids}::text[]) OR (m."equipmentId"=ANY(${ids}::text[]) AND m."entityType"=ANY(${types}::text[])))
    ORDER BY n."createdAt" DESC,n.id DESC LIMIT 100`);
  return { userId: u.id, id: { in: notices.map((n) => n.id) } };
}

export async function assignedEquipmentIds(ids: string[], person?: string) {
  if (!person) return ids;
  const p = await db.user.findUnique({
    where: { id: person },
    select: { role: true, workspaceAccess: true },
  });
  if (!p) return [];
  return (await db.equipment.findMany({ where: { id: { in: ids } } }))
    .filter((e) => allowedDowntimeEquipment(p.role, p.workspaceAccess, e))
    .map((e) => e.id);
}
