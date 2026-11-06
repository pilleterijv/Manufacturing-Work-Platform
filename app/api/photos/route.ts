import sharp from "sharp";
import { z } from "zod";
import { db } from "@/lib/db";
import { storePhoto } from "@/lib/storage";
import {
  requireUser,
  grants,
  jsonBody,
  limit,
  HttpError,
  failure,
} from "@/lib/security";
let processing = 0;
export async function POST(req: Request) {
  let slot = false;
  try {
    const u = await requireUser();
    const g = await grants(u);
    if (!g.includes("work") && !g.includes("audits"))
      throw new HttpError(403, "Photo upload is not permitted");
    await limit(`photo:${u.id}`, 60, 3600);
    await limit("photo:global", 500, 3600);
    if (processing >= 2)
      throw new HttpError(429, "Image processing is busy; try again");
    processing++;
    slot = true;
    const b = z
      .object({ image: z.string().max(12 * 1024 * 1024) })
      .parse(await jsonBody(req, 12 * 1024 * 1024));
    const match = b.image.match(
      /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/,
    );
    if (!match) throw new HttpError(400, "Choose a JPEG, PNG, or WebP image");
    const input = Buffer.from(match[2], "base64");
    if (input.length > 8 * 1024 * 1024)
      throw new HttpError(413, "Images must be under 8 MB");
    let output: Buffer;
    try {
      output = await sharp(input, {
        limitInputPixels: 16000000,
        animated: false,
      })
        .rotate()
        .resize({
          width: 1920,
          height: 1920,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new HttpError(400, "The image cannot be decoded");
    }
    const id = crypto.randomUUID();
    await storePhoto(id, output);
    await db.photo.create({ data: { id, userId: u.id } });
    return Response.json({ id });
  } catch (e) {
    return failure(e);
  } finally {
    if (slot) processing--;
  }
}
