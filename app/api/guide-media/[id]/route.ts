import { canReadEvidence } from "@/lib/evidence";
import { db } from "@/lib/db";
import { openVideo } from "@/lib/storage";
import { videoRange } from "@/lib/media-range";
import { requireUser, HttpError, failure } from "@/lib/security";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let file: Awaited<ReturnType<typeof openVideo>> | undefined;
  try {
    const u = await requireUser(),
      { id } = await params;
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new HttpError(404, "Video not found");
    const media = await db.guideMedia.findUnique({ where: { id } });
    if (!media) throw new HttpError(404, "Video not found");
    if (!(await canReadEvidence(u, id, "video", media.userId)))
      throw new HttpError(403, "Video access denied");
    file = await openVideo(id, req.signal);
    const size = file.size;
    const range = videoRange(req.headers.get("range"), size);
    const headers: Record<string, string> = {
      "Content-Type": media.mime,
      "Cache-Control": "private, no-store",
      "Accept-Ranges": "bytes",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    };
    if (!range) {
      await file.close();
      file = undefined;
      return new Response(null, {
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${size}` },
      });
    }
    headers["Content-Length"] = String(range.end - range.start + 1);
    if (range.partial)
      headers["Content-Range"] =
        `bytes ${range.start}-${range.end}/${file.size}`;
    const body = await file.stream(range.start, range.end);
    file = undefined; // stream owns its file handle and closes on completion/cancellation
    return new Response(body, { status: range.partial ? 206 : 200, headers });
  } catch (e) {
    await file?.close().catch(() => {});
    return failure(e);
  }
}
