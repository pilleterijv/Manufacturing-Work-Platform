import { canReadEvidence } from "@/lib/evidence";
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
    if (!(await canReadEvidence(u, id, "photo", photo.userId)))
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
