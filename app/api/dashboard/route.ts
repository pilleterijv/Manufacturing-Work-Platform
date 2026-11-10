import { equipmentScope } from "@/lib/location-access";
import { db } from "@/lib/db";
import { requireUser, grants, failure, HttpError } from "@/lib/security";
import { leadershipReport } from "@/lib/leadership";
import { reportResponse, withReportSlot } from "@/lib/report-response";
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const g = await grants(user);
    if (!g.includes("dashboard") && !g.includes("leadership"))
      throw new HttpError(403, "Dashboard access is not permitted");
    const params = new URL(req.url).searchParams;
    // Department aggregate access is independent from workspace-wide leadership.
    if (!g.includes("leadership") && !params.get("department")) {
      const first = await db.equipment.findFirst({
        where: { AND: [equipmentScope(user), { department: { not: "" } }] },
        orderBy: { department: "asc" },
        select: { department: true },
      });
      if (!first)
        throw new HttpError(
          400,
          "Add department equipment before opening its dashboard",
        );
      params.set("department", first.department);
    }
    if (params.get("format") === "xlsx") await requireUser("export");
    return await withReportSlot(async () =>
      reportResponse(await leadershipReport(params, user), params, req.signal),
    );
  } catch (error) {
    return failure(error);
  }
}
