import { z } from "zod";
import { authenticateIntegration } from "@/lib/integrations";
import { ingestExternalRows } from "@/lib/external-data";
import { db } from "@/lib/db";
import { failure, HttpError, limit, readJsonBody } from "@/lib/security";
export async function POST(req: Request) {
  try {
    const source = await authenticateIntegration(req);
    await limit("external:" + source.id, 60, 60);
    const b = z
      .object({
        feedId: z.string().uuid(),
        sequence: z.string().regex(/^[1-9][0-9]{0,18}$/),
        rows: z.array(z.unknown()).max(1000),
      })
      .parse(await readJsonBody(req, 4 * 1024 * 1024));
    const feed = await db.externalFeed.findUnique({ where: { id: b.feedId } });
    if (!feed || feed.sourceId !== source.id)
      throw new HttpError(403, "Feed does not belong to this source");
    return Response.json(
      await ingestExternalRows(
        feed.id,
        b.rows,
        source.tokenHash,
        undefined,
        b.sequence,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
