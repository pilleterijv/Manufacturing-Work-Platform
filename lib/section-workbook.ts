import { Prisma } from "@prisma/client";
import { db } from "./db";
import { recordScope } from "./location-access";
import { recordFilters } from "./filters";
import { streamWorkbook, paged } from "./excel-stream";
import { HttpError } from "./http-error";
export async function sectionWorkbook(
  req: Request,
  u: any,
  g: string[],
  ids: string[],
  person: string | undefined,
  search: string,
  matchingEquipment: string[],
  section: string,
) {
  const kinds: Record<
    string,
    { kind: string; workflow?: string; grant: string; label: string }
  > = {
    leaders: {
      kind: "audit",
      workflow: "leader",
      grant: "audits",
      label: "DL-TL standard work",
    },
    operator: {
      kind: "run",
      workflow: "process",
      grant: "work",
      label: "Operator tasks",
    },
    process: {
      kind: "audit",
      workflow: "process",
      grant: "audits",
      label: "Process verification",
    },
    changeovers: {
      kind: "run",
      workflow: "changeover",
      grant: "work",
      label: "Changeovers",
    },
    studies: { kind: "study", grant: "studies", label: "Time studies" },
  };
  const choice = kinds[section];
  if (!choice) throw new HttpError(400, "Choose a valid export section");
  if (
    !g.includes(choice.grant) &&
    !(choice.kind !== "audit" && g.includes("analytics"))
  )
    throw new HttpError(403, "Section export is not permitted");
  const asOf = new Date();
  const workflowWhere =
    choice.workflow === "process"
      ? {
          OR: [
            { data: { path: ["snapshot", "workflow"], equals: "process" } },
            {
              data: { path: ["snapshot", "workflow"], equals: Prisma.AnyNull },
            },
          ],
        }
      : choice.workflow
        ? { data: { path: ["snapshot", "workflow"], equals: choice.workflow } }
        : {};
  return streamWorkbook(
    `floorwork-${section}.xlsx`,
    async (book) => {
      const details = book.addWorksheet("Export details"),
        results = book.addWorksheet(choice.label),
        answers = book.addWorksheet("Task answers"),
        handoff = book.addWorksheet("Leader handoff");
      await details.addRow(["Section", choice.label]);
      await details.addRow(["Exported at UTC", asOf.toISOString()]);
      await details.addRow(["Search", search]);
      await details.addRow(["Person filter ID", person || ""]);
      await details.addRow([
        "Access",
        "Account and machine scope applied; completion history follows existing history permissions",
      ]);
      await results.addRow([
        "Record ID",
        "Date UTC",
        "Recorded by",
        "Username",
        "Checklist / study",
        "Revision",
        "Plant",
        "Department",
        "Area",
        "Line",
        "Equipment",
        "Shift",
        "Pass-down notes",
        "Duration seconds",
        "Follow up",
        "Previous product",
        "Next product",
        "Changeover type",
        "Changeover notes",
      ]);
      await answers.addRow([
        "Record ID",
        "Step ID",
        "Section",
        "Timing",
        "Task",
        "Answer",
        "Comment",
        "Photo ID",
        "Video ID",
        "Answered at UTC",
      ]);
      const roomKeys = [
        "room",
        "item",
        "lot",
        "targetSpeed",
        "actualSpeed",
        "remaining",
        "issues",
        "nextOrder",
        "status",
        "materialsSplit",
        "weighsLeft",
        "cleanBins",
        "inspectingFor",
        "requiresYielding",
        "yielded",
        "round",
        "totalRounds",
        "solutionMixed",
        "nextSolutionReady",
        "lastFourRecalculated",
      ];
      await handoff.addRow([
        "Record ID",
        "Shift",
        "Room / machine",
        "Item",
        "Lot",
        "Target speed",
        "Actual speed",
        "Remaining material",
        "Issues / root cause",
        "Next order ready",
        "Status",
        "Materials split correctly",
        "Weighs left",
        "Clean bins",
        "Inspecting for",
        "Requires yielding",
        "Yielded",
        "Current round",
        "Total rounds",
        "Current solution mixed",
        "Next solution ready",
        "Last four rounds recalculated",
      ]);
      let count = 0;
      for await (const r of paged((cursor) =>
        db.record.findMany({
          where: {
            AND: [
              recordScope(ids),
              recordFilters(person, search, matchingEquipment),
              workflowWhere,
            ],
            kind: choice.kind,
            created: { lte: asOf },
            ...(g.includes("analytics") ? {} : { userId: u.id }),
          },
          include: { user: { select: { name: true, username: true } } },
          orderBy: { id: "asc" },
          take: 100,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      )) {
        const d = r.data as any,
          e = d.snapshot?.equipment || d.equipmentSnapshot || {};
        count++;
        await results.addRow([
          r.id,
          r.created,
          r.user.name,
          r.user.username,
          d.snapshot?.title || d.title || "",
          d.snapshot?.revision || "",
          e.plant || "",
          e.department || "",
          e.area || "",
          e.line || "",
          e.name || "",
          d.handoff?.shift || "",
          d.handoff?.notes || "",
          d.durationSeconds ?? "",
          d.followUp ?? false,
          d.changeover?.fromProduct || "",
          d.changeover?.toProduct || "",
          d.changeover?.type || "",
          d.changeover?.notes || "",
        ]);
        for (const a of d.responses || []) {
          const step = d.snapshot?.steps?.find((s: any) => s.id === a.stepId);
          await answers.addRow([
            r.id,
            a.stepId,
            step?.group || "",
            step?.timing || "",
            step?.text || "",
            a.answer === true
              ? "Yes"
              : a.answer === false
                ? "No"
                : "Not answered",
            a.comment || "",
            a.photo || "",
            a.video || "",
            a.at || "",
          ]);
        }
        for (const room of d.handoff?.rooms || [])
          await handoff.addRow([
            r.id,
            d.handoff?.shift || "",
            ...roomKeys.map((k) => room[k] || ""),
          ]);
        if (choice.kind === "study")
          for (const c of d.cycles || [])
            await answers.addRow([
              r.id,
              "",
              "Time observation",
              c.at || "",
              c.element,
              c.seconds,
              "Seconds",
              "",
              "",
              c.at || "",
            ]);
      }
      await details.addRow(["Completed records exported", count]);
      if (!count)
        await details.addRow([
          "No completions",
          "No completed records match these filters. Published checklist definitions are included separately.",
        ]);
      if (choice.workflow) {
        const definitions = book.addWorksheet("Published checklists");
        await definitions.addRow([
          "Family",
          "Revision",
          "Title",
          "Workflow",
          "Equipment ID",
          "Step ID",
          "Section",
          "Timing",
          "Task",
          "Evidence required",
        ]);
        for await (const s of paged(
          (cursor) =>
            db.$queryRaw<
              any[]
            >`SELECT s.* FROM "Standard" s JOIN (SELECT family,max(revision) revision FROM "Standard" GROUP BY family) latest ON latest.family=s.family AND latest.revision=s.revision WHERE NOT s.archived AND s."equipmentId"=ANY(${ids}::text[]) AND s.kind=${choice.kind} AND s.workflow=${choice.workflow} AND s.id>${cursor || ""} AND (${search}='' OR s.title ILIKE ${"%" + search + "%"} OR s."equipmentId"=ANY(${matchingEquipment}::text[])) AND (${person || ""}='' OR s."assigneeIds"='[]'::jsonb OR s."assigneeIds" @> ${JSON.stringify(person ? [person] : [])}::jsonb) AND (${choice.kind}<>'audit' OR ${u.role}='Admin' OR s."assigneeIds"='[]'::jsonb OR s."assigneeIds" @> ${JSON.stringify([u.id])}::jsonb) ORDER BY s.id LIMIT 100`,
        ))
          for (const step of s.steps as any[])
            await definitions.addRow([
              s.family,
              s.revision,
              s.title,
              s.workflow,
              s.equipmentId,
              step.id,
              step.group || "",
              step.timing || "",
              step.text,
              step.photo ? "Photo or video" : "Optional",
            ]);
      }
    },
    req.signal,
  );
}
