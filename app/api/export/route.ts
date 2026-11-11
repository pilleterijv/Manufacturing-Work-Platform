import { readFilters, recordFilters } from "@/lib/filters";
import { equipmentIds, recordScope } from "@/lib/location-access";
import { streamWorkbook, paged } from "@/lib/excel-stream";
import { db } from "@/lib/db";
import { requireUser, grants, failure } from "@/lib/security";
import { stats } from "@/lib/rules";
import { addOperationsSheets } from "@/lib/operations-export";
const locationColumns = [
  "Plant",
  "Department",
  "Area",
  "Line",
  "Equipment name",
];
const locationValues = (equipment: any) =>
  ["plant", "department", "area", "line", "name"].map(
    (key) => equipment?.[key] ?? "",
  );
export async function GET(req: Request) {
  try {
    const u = await requireUser("export");
    const g = await grants(u);
    const ids = await equipmentIds(u);
    const { person, search } = readFilters(req.url);
    const asOf = new Date();
    const records = paged((cursor) =>
      db.record.findMany({
        where: {
          AND: [recordScope(ids), recordFilters(person, search)],
          ...(g.includes("analytics") ? {} : { userId: u.id }),
          created: { lte: asOf },
          kind: {
            in: [
              ...(g.includes("work") || g.includes("analytics") ? ["run"] : []),
              ...(g.includes("studies") || g.includes("analytics")
                ? ["study"]
                : []),
              ...(g.includes("audits") ? ["audit"] : []),
            ],
          },
        },
        include: { user: { select: { name: true } } },
        orderBy: { id: "asc" },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    );
    return await streamWorkbook(
      "floorwork.xlsx",
      async (book) => {
        const sheets = Object.fromEntries(
          [
            "Standard work",
            "Responses",
            "Time observations",
            "Statistics",
            "DL-TL Standard Work",
            "DL-TL cycles",
          ].map((name) => [name, book.addWorksheet(name)]),
        );
        await sheets["Standard work"].addRow([
          "ID",
          "Date",
          "Recorder",
          "Standard",
          "Revision",
          "Equipment ID",
          ...locationColumns,
          "Duration seconds",
          "Follow up",
        ]);
        await sheets.Responses.addRow([
          "Record",
          "Type",
          "Step",
          "Answer",
          "Comment",
          "Photo ID",
          "Video ID",
        ]);
        await sheets["Time observations"].addRow([
          "Study",
          "Title",
          "Equipment ID",
          ...locationColumns,
          "Element",
          "Seconds",
          "Timestamp",
        ]);
        await sheets.Statistics.addRow([
          "Study",
          "Element",
          "N",
          "Average",
          "Median",
          "Min",
          "Max",
          "Range",
          "Standard deviation (population)",
        ]);
        await sheets["DL-TL Standard Work"].addRow([
          "ID",
          "Date",
          "Recorded by",
          "Operator / context",
          "Standard",
          "Revision",
          "Equipment ID",
          ...locationColumns,
          "Target seconds",
          "Tolerance percent",
          "Follow up",
          "Checklist purpose",
          "Shift",
          "Pass-down",
          "Room / machine handoff JSON",
        ]);
        await sheets["DL-TL cycles"].addRow([
          "Audit",
          "Element",
          "Seconds",
          "Timestamp",
          "Meets target",
        ]);
        for await (const r of records) {
          book.check();
          const d = r.data as any;
          if (
            r.kind === "run" &&
            (g.includes("work") || g.includes("analytics"))
          )
            await sheets["Standard work"].addRow([
              r.id,
              r.created,
              r.user.name,
              d.snapshot.title,
              d.snapshot.revision,
              d.snapshot.equipmentId,
              ...locationValues(d.snapshot.equipment),
              d.durationSeconds,
              d.followUp,
            ]);
          if (r.kind === "audit" && g.includes("audits")) {
            await sheets["DL-TL Standard Work"].addRow([
              r.id,
              r.created,
              r.user.name,
              d.operator,
              d.snapshot.title,
              d.snapshot.revision,
              d.snapshot.equipmentId,
              ...locationValues(d.snapshot.equipment),
              d.snapshot.workflow === "leader" ? null : d.snapshot.target,
              d.snapshot.workflow === "leader" ? null : d.snapshot.tolerance,
              d.followUp,
              d.snapshot.workflow === "leader"
                ? "DL/TL leader work"
                : "Standard work audit",
              d.handoff?.shift || "",
              d.handoff?.notes || "",
              d.handoff ? JSON.stringify(d.handoff.rooms) : "",
            ]);
            for (const c of d.cycles ?? [])
              await sheets["DL-TL cycles"].addRow([
                r.id,
                c.element,
                c.seconds,
                c.at,
                c.seconds <=
                  d.snapshot.target * (1 + d.snapshot.tolerance / 100),
              ]);
          }
          if (
            (r.kind === "run" &&
              (g.includes("work") || g.includes("analytics"))) ||
            (r.kind === "audit" && g.includes("audits"))
          )
            for (const a of d.responses)
              await sheets.Responses.addRow([
                r.id,
                r.kind,
                d.snapshot.steps.find((s: any) => s.id === a.stepId)?.text,
                a.answer ? "Yes" : "No",
                a.comment,
                a.photo,
                a.video ?? "",
              ]);
          if (
            r.kind === "study" &&
            (g.includes("studies") || g.includes("analytics"))
          ) {
            for (const c of d.cycles ?? [])
              await sheets["Time observations"].addRow([
                r.id,
                d.title,
                d.equipmentId,
                ...locationValues(d.equipmentSnapshot),
                c.element,
                c.seconds,
                c.at,
              ]);
            for (const element of new Set<string>(
              d.cycles.map((c: any) => c.element),
            )) {
              const s = stats(
                d.cycles
                  .filter((c: any) => c.element === element)
                  .map((c: any) => c.seconds),
              )!;
              await sheets.Statistics.addRow([
                r.id,
                element,
                s.count,
                s.average,
                s.median,
                s.min,
                s.max,
                s.range,
                s.standardDeviation,
              ]);
            }
          }
        }
        await addOperationsSheets(book, g, u, { person, search });
      },
      req.signal,
    );
  } catch (e) {
    return failure(e);
  }
}
