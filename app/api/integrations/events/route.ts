import {
  authenticateIntegration,
  ingestMachineEvent,
} from "@/lib/integrations";
import { readJsonBody, failure, limit } from "@/lib/security";
export async function POST(req: Request) {
  try {
    const source = await authenticateIntegration(req);
    await limit(`integration:${source.id}`, 600, 60);
    // Bearer authentication replaces cookie/Origin authentication for this one
    // server-to-server endpoint. Preserve the shared streaming body limit.
    const body = await readJsonBody(req, 64 * 1024);
    return Response.json(
      await ingestMachineEvent(source.id, body, source.tokenHash),
    );
  } catch (e) {
    return failure(e);
  }
}
