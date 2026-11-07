import { linkedGuideMedia } from "@/lib/guide-media";
import { equipmentIds, equipmentSql } from "@/lib/location-access";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { readPhoto } from "@/lib/storage";
import { requireUser, grants, HttpError, failure } from "@/lib/security";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await requireUser();
    const { id } = await params;
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new HttpError(404, "Photo not found");
    const photo = await db.photo.findUnique({ where: { id } });
    if (!photo) throw new HttpError(404, "Photo not found");
    const owner = photo.userId === u.id,
      g = await grants(u),
      ids = await equipmentIds(u);
    const guide = await linkedGuideMedia(u, id, "photo");
    const kinds = [
      ...(owner || g.includes("analytics") ? ["run"] : []),
      ...(owner || g.includes("audits") ? ["audit"] : []),
    ];
    const recordLink = kinds.length
      ? (
          await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM "Record" WHERE kind IN (${Prisma.join(kinds)})
      ${owner && !g.includes("analytics") && !g.includes("audits") ? Prisma.sql`AND "userId"=${u.id}` : Prisma.empty}
      AND ${equipmentSql(ids, Prisma.sql`COALESCE(data->>'equipmentId',data->'snapshot'->>'equipmentId')`)}
      AND (data->'responses') @> ${JSON.stringify([{ photo: id }])}::jsonb LIMIT 1`)
        ).length > 0
      : false;
    const anyGuide = owner
      ? await db.content.findFirst({
          where: { media: { array_contains: [{ id, kind: "photo" }] } },
          select: { id: true },
        })
      : null;
    const anyRecord = owner
      ? (
          await db.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT id FROM "Record" WHERE (data->'responses') @> ${JSON.stringify([{ photo: id }])}::jsonb LIMIT 1`,
          )
        ).length > 0
      : false;
    if (!guide && !recordLink && !(owner && !anyGuide && !anyRecord))
      throw new HttpError(403, "Photo access denied");
    return new Response(new Uint8Array(await readPhoto(id)), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
