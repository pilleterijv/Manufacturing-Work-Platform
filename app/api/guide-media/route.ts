import { db } from "@/lib/db";
import { storeVideo } from "@/lib/storage";
import {
  requireUser,
  jsonBody,
  limit,
  HttpError,
  failure,
} from "@/lib/security";
import { z } from "zod";
let processing = 0;
export async function POST(req: Request) {
  let slot = false;
  try {
    const u = await requireUser("manage");
    await limit(`guide-video:${u.id}`, 20, 3600);
    await limit("guide-video:global", 100, 3600);
    if (processing >= 2)
      throw new HttpError(429, "Media upload busy; try again");
    processing++;
    slot = true;
    const b = z
      .object({ video: z.string().max(45 * 1024 * 1024) })
      .parse(await jsonBody(req, 46 * 1024 * 1024));
    const match = b.video.match(
      /^data:video\/(mp4|webm|quicktime);base64,([A-Za-z0-9+/=]+)$/,
    );
    if (!match) throw new HttpError(400, "Choose an MP4, WebM or MOV video");
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 32 * 1024 * 1024)
      throw new HttpError(413, "Video must be under 32 MB");
    const webm =
      bytes.length > 4 &&
      bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    const mp4 = bytes.length > 12 && bytes.toString("ascii", 4, 8) === "ftyp";
    if ((match[1] === "webm" && !webm) || (match[1] !== "webm" && !mp4))
      throw new HttpError(400, "Video container does not match its type");
    const mime = `video/${match[1]}`,
      id = crypto.randomUUID();
    await storeVideo(id, bytes, mime);
    await db.guideMedia.create({
      data: { id, userId: u.id, mime, bytes: bytes.length },
    });
    return Response.json({ id });
  } catch (e) {
    return failure(e);
  } finally {
    if (slot) processing--;
  }
}
