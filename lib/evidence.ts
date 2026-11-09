import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { equipmentIds, type ScopedUser } from "./location-access";
import { grants, HttpError } from "./security";
export { mediaSchema, evidenceSchema, type Evidence } from "./evidence-schema";
import type { Evidence } from "./evidence-schema";
export async function ownEvidence(
  userId: string,
  media: Evidence[],
  retained: unknown = [],
  tx: Prisma.TransactionClient = db,
) {
  const old = Array.isArray(retained) ? retained : [];
  for (const m of media) {
    if (
      old.some(
        (x) => x && typeof x === "object" && x.id === m.id && x.kind === m.kind,
      )
    )
      continue;
    const found =
      m.kind === "photo"
        ? await tx.photo.findFirst({ where: { id: m.id, userId } })
        : await tx.guideMedia.findFirst({ where: { id: m.id, userId } });
    if (!found)
      throw new HttpError(
        403,
        "Evidence must be uploaded by you or already attached to this record",
      );
  }
}
export async function canReadEvidence(
  u: ScopedUser,
  id: string,
  kind: "photo" | "video",
  ownerId: string,
) {
  const ids = await equipmentIds(u),
    g = await grants(u),
    part = JSON.stringify([{ id, kind }]);
  const content = await db.content.findFirst({
    where: {
      active: true,
      OR: [{ equipmentId: null }, { equipmentId: { in: ids } }],
      media: { array_contains: [{ id, kind }] },
    },
    select: { id: true },
  });
  if (content) return true;
  const kinds = [
    ...(g.includes("work") || g.includes("analytics") ? ["run"] : []),
    ...(g.includes("audits") ? ["audit"] : []),
    ...(g.includes("maintenance") ? ["pm"] : []),
  ];
  if (kinds.length) {
    const key = kind === "photo" ? "photo" : "video";
    const rows = await db.$queryRaw<
      { id: string }[]
    >(Prisma.sql`SELECT r.id FROM "Record" r LEFT JOIN "Standard" s ON s.id=r."standardId"
 WHERE r.kind IN (${Prisma.join(kinds)}) AND COALESCE(s."equipmentId",r.data->>'equipmentId')=ANY(${ids}::text[])
 AND (r."userId"=${u.id} OR ${u.role === "Admin"} OR (r.kind='run' AND ${g.includes("analytics")}) OR (r.kind='audit' AND ${g.includes("audits")}) OR (r.kind='pm' AND ${g.includes("maintenance")}))
 AND ((r.data->'responses') @> ${JSON.stringify([{ [key]: id }])}::jsonb OR (r.data->'media') @> ${part}::jsonb) LIMIT 1`);
    if (rows.length) return true;
  }
  if (g.includes("problems")) {
    if (
      await db.problem.findFirst({
        where: {
          equipmentId: { in: ids },
          media: { array_contains: [{ id, kind }] },
        },
        select: { id: true },
      })
    )
      return true;
    if (
      await db.problemAction.findFirst({
        where: {
          problem: { equipmentId: { in: ids } },
          media: { array_contains: [{ id, kind }] },
        },
        select: { id: true },
      })
    )
      return true;
  }
  if (
    g.includes("ideas") &&
    (await db.idea.findFirst({
      where: {
        equipmentId: { in: ids },
        media: { array_contains: [{ id, kind }] },
      },
      select: { id: true },
    }))
  )
    return true;
  if (ownerId !== u.id) return false;
  // Draft uploads stay private. Ownership never overrides an existing record's scope.
  const any = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
 SELECT id FROM "Content" WHERE media @> ${part}::jsonb
 UNION ALL SELECT id FROM "Problem" WHERE media @> ${part}::jsonb
 UNION ALL SELECT id FROM "ProblemAction" WHERE media @> ${part}::jsonb
 UNION ALL SELECT id FROM "Idea" WHERE media @> ${part}::jsonb
 UNION ALL SELECT id FROM "Record" WHERE (data->'media') @> ${part}::jsonb OR (data->'responses') @> ${JSON.stringify([{ [kind === "photo" ? "photo" : "video"]: id }])}::jsonb LIMIT 1`);
  return any.length === 0;
}
