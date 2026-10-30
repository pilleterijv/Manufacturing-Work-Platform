import { requireUser, failure } from "@/lib/security";
import ExcelJS from "exceljs";
import { leadershipReport } from "@/lib/leadership";
export async function GET(req: Request) {
  try {
    await requireUser("leadership");
    const params = new URL(req.url).searchParams;
    const report = await leadershipReport(params);
    if (params.get("format") === "xlsx") {
      await requireUser("export");
      const book = new ExcelJS.Workbook(),
        summary = book.addWorksheet("Leadership summary"),
        shifts = book.addWorksheet("Downtime by shift"),
        reasons = book.addWorksheet("Downtime by reason"),
        ideas = book.addWorksheet("Idea pipeline");
      summary.addRow(["Department", report.department || "All departments"]);
      summary.addRow(["From", report.from]);
      summary.addRow(["To", report.to]);
      summary.addRow(["Time zone", report.timezone]);
      summary.addRow(["Generated UTC", report.generatedAt]);
      summary.addRow([
        "Period metrics",
        "Work, studies, audits, downtime, ideas created",
      ]);
      summary.addRow([
        "Current metrics",
        "Equipment, standards, libraries, idea pipeline, accounts",
      ]);
      for (const [key, value] of Object.entries(report.summary))
        if (key !== "cycleStats") summary.addRow([key, value]);
      shifts.addRow(["Shift date", "Shift", "Time zone", "Seconds"]);
      for (const s of report.shifts)
        shifts.addRow([s.shiftDate, s.shift, s.timezone, s.seconds]);
      reasons.addRow(["Reason", "Seconds"]);
      for (const r of report.reasons) reasons.addRow([r.reason, r.seconds]);
      ideas.addRow(["Status", "Current count"]);
      for (const [status, count] of Object.entries(report.ideaStatuses))
        ideas.addRow([status, count]);
      for (const sheet of book.worksheets) {
        sheet.columns.forEach((c) => {
          c.width = 30;
        });
        sheet.views = [{ state: "frozen", ySplit: 1 }];
      }
      return new Response(new Uint8Array(await book.xlsx.writeBuffer()), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition":
            'attachment; filename="leadership-dashboard.xlsx"',
        },
      });
    }
    return Response.json(report);
  } catch (e) {
    return failure(e);
  }
}
