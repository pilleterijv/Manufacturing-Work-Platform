import { db } from "@/lib/db";
import { readVideo } from "@/lib/storage";
import { linkedGuideMedia } from "@/lib/guide-media";
import { requireUser, HttpError, failure } from "@/lib/security";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await requireUser(),
      { id } = await params;
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new HttpError(404, "Video not found");
    const media = await db.guideMedia.findUnique({ where: { id } });
    if (!media) throw new HttpError(404, "Video not found");
    const linked = await linkedGuideMedia(u, id, "video");
    const anyLink =
      media.userId === u.id
        ? await db.content.findFirst({
            where: { media: { array_contains: [{ id, kind: "video" }] } },
            select: { id: true },
          })
        : null;
    if (!linked && (media.userId !== u.id || anyLink))
      throw new HttpError(403, "Video access denied");
    const data = await readVideo(id),
      headers: Record<string, string> = {
        "Content-Type": media.mime,
        "Cache-Control": "private, no-store",
        "Accept-Ranges": "bytes",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      };
    const range = req.headers.get("range");
    if (range) {
      const m = range.match(/^bytes=(\d*)-(\d*)$/);
      if (!m || (!m[1] && !m[2]))
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${data.length}` },
        });
      const start = m[1]
        ? Number(m[1])
        : Math.max(0, data.length - Number(m[2]));
      const end =
        m[1] && m[2]
          ? Math.min(data.length - 1, Number(m[2]))
          : data.length - 1;
      if (start >= data.length || start > end)
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${data.length}` },
        });
      headers["Content-Range"] = `bytes ${start}-${end}/${data.length}`;
      headers["Content-Length"] = String(end - start + 1);
      return new Response(new Uint8Array(data.subarray(start, end + 1)), {
        status: 206,
        headers,
      });
    }
    headers["Content-Length"] = String(data.length);
    return new Response(new Uint8Array(data), { headers });
  } catch (e) {
    return failure(e);
  }
}
