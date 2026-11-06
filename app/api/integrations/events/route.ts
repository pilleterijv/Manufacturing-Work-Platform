import {
  authenticateIntegration,
  ingestMachineEvent,
} from "@/lib/integrations";
import { jsonBody, failure, limit } from "@/lib/security";
export async function POST(req: Request) {
  try {
    const source = await authenticateIntegration(req);
    await limit(`integration:${source.id}`, 600, 60);
    // Bearer authentication replaces cookie/Origin authentication for this one
    // server-to-server endpoint. Preserve the shared streaming body limit.
    const headers = new Headers(req.headers);
    headers.set("origin", new URL(process.env.APP_ORIGIN!).origin);
    const body = await jsonBody(new Request(req, { headers }), 64 * 1024);
    return Response.json(
      await ingestMachineEvent(source.id, body, source.tokenHash),
    );
  } catch (e) {
    return failure(e);
  }
}
