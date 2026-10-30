import { requireUser, failure } from "@/lib/security";
import { leadershipReport } from "@/lib/leadership";
export async function GET(req: Request) {
  try {
    await requireUser("leadership");
    return Response.json(await leadershipReport(new URL(req.url).searchParams));
  } catch (e) {
    return failure(e);
  }
}
