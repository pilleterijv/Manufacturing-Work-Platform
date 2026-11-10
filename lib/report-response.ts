import { streamWorkbook } from "./excel-stream";
import type { leadershipReport } from "./leadership";
import { HttpError } from "./security";
let active = 0;
export async function withReportSlot<T>(run: () => Promise<T>) {
  if (active >= 2)
    throw new HttpError(429, "Reporting is busy. Try again shortly.");
  active++;
  try {
    return await run();
  } finally {
    active--;
  }
}
export async function reportResponse(
  report: Awaited<ReturnType<typeof leadershipReport>>,
  params: URLSearchParams,
  signal?: AbortSignal,
) {
  if (params.get("format") !== "xlsx") return Response.json(report);
  return streamWorkbook(
    "leadership-dashboard.xlsx",
    async (book) => {
      const summary = book.addWorksheet("Leadership summary"),
        shifts = book.addWorksheet("Downtime by shift"),
        reasons = book.addWorksheet("Downtime by reason"),
        ideas = book.addWorksheet("Idea pipeline");
      await summary.addRow([
        "Department",
        report.department || "All departments",
      ]);
      await summary.addRow(["From", report.from]);
      await summary.addRow(["To", report.to]);
      await summary.addRow(["Time zone", report.timezone]);
      await summary.addRow(["Generated UTC", report.generatedAt]);
      await summary.addRow([
        "Period metrics",
        "Work, studies, DL/TL Standard Work, downtime, ideas created",
      ]);
      await summary.addRow([
        "Current metrics",
        "Equipment, standards, libraries, idea pipeline, accounts",
      ]);
      for (const [key, value] of Object.entries(report.summary))
        if (key !== "cycleStats")
          await summary.addRow([key, value as number | null]);
      await shifts.addRow(["Shift date", "Shift", "Time zone", "Seconds"]);
      for (const s of report.shifts)
        await shifts.addRow([s.shiftDate, s.shift, s.timezone, s.seconds]);
      await reasons.addRow(["Reason", "Seconds"]);
      for (const r of report.reasons)
        await reasons.addRow([r.reason, r.seconds]);
      await ideas.addRow(["Status", "Current count"]);
      for (const [status, count] of Object.entries(report.ideaStatuses))
        await ideas.addRow([status, count]);
    },
    signal,
  );
}
