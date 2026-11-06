import { requireUser, failure } from "@/lib/security";
import { leadershipReport } from "@/lib/leadership";
import { reportResponse, withReportSlot } from "@/lib/report-response";
export async function GET(req: Request) {
  try {
    await requireUser("leadership");
    const params = new URL(req.url).searchParams;
    if (params.get("format") === "xlsx") await requireUser("export");
    return await withReportSlot(async () =>
      reportResponse(await leadershipReport(params), params, req.signal),
    );
  } catch (e) {
    return failure(e);
  }
}
