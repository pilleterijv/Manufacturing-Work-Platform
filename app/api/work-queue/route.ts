import { crewWorks } from "@/lib/crew-rotation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, grants, failure, HttpError } from "@/lib/security";
import { equipmentIds, visiblePeople } from "@/lib/location-access";
import { focusedEquipmentIds } from "@/lib/equipment-label";
import { localToday, shiftConfigSchema } from "@/lib/operations-rules";
import { nearbyShifts, scheduledQueue, queueOrder, type QueueItem } from "@/lib/work-queue-rules";
export async function GET(req: Request) {
  try {
    const u = await requireUser(),
      g = await grants(u),
      p = new URL(req.url).searchParams,
      scope = z.enum(["my", "team"]).parse(p.get("scope") || "my"),
      team = scope === "team";
    const canTeam =
      ["Admin", "Manager", "DL/TL"].includes(u.role) &&
      (g.includes("dashboard") || g.includes("leadership") || g.includes("analytics"));
    if (team && !canTeam) throw new HttpError(403, "Department review is not assigned to this account");
    const plant = z
        .string()
        .max(100)
        .parse(p.get("plant") || ""),
      department = z
        .string()
        .max(100)
        .parse(p.get("department") || ""),
      area = z
        .string()
        .max(100)
        .parse(p.get("area") || "");
    const allIds = focusedEquipmentIds(req.url, await equipmentIds(u));
    const equipment = await db.equipment.findMany({
      where: { id: { in: allIds } },
      orderBy: [
        { plant: "asc" },
        { department: "asc" },
        { area: "asc" },
        { line: "asc" },
        { name: "asc" },
        { id: "asc" },
      ],
    });
    const ids = equipment
        .filter(
          (e) =>
            (!plant || e.plant === plant) &&
            (!department || e.department === department) &&
            (!area || e.area === area)
        )
        .map((e) => e.id),
      now = new Date(),
      cutoff = new Date(+now - 3 * 86400000);
    const [setting, people, schedules] = await Promise.all([
      db.setting.findUniqueOrThrow({ where: { key: "shifts" } }),
      visiblePeople(u, ids),
      db.workSchedule.findMany({
        where: { equipmentId: { in: ids }, active: true },
        orderBy: { id: "asc" },
        take: 1001,
      }),
    ]);
    const config = shiftConfigSchema.parse(setting.value),
      today = localToday(config.timezone, now),
      families = [...new Set(schedules.slice(0, 1000).map((s) => s.family))];
    const [baseline, recent, records, plans, defects, actions, ideas, cases] = await Promise.all([
      families.length
        ? db.$queryRaw<
            any[]
          >`SELECT DISTINCT ON (family) id,family,revision,created,title,kind,workflow,archived,"assigneeIds" FROM "Standard" WHERE family=ANY(${families}::text[]) AND "equipmentId"=ANY(${ids}::text[]) AND created<=${cutoff} ORDER BY family,revision DESC`
        : [],
      families.length
        ? db.standard.findMany({
            where: {
              family: { in: families },
              equipmentId: { in: ids },
              created: { gt: cutoff, lte: now },
            },
            select: {
              id: true,
              family: true,
              revision: true,
              created: true,
              title: true,
              kind: true,
              workflow: true,
              archived: true,
              assigneeIds: true,
            },
          })
        : [],
      families.length
        ? db.record.findMany({
            where: {
              kind: {
                in: [
                  ...(g.includes("work") || (team && g.includes("analytics")) ? ["run"] : []),
                  ...(g.includes("audits") || (team && g.includes("analytics")) ? ["audit"] : []),
                ],
              },
              standard: {
                family: { in: families },
                equipmentId: { in: ids },
              },
              created: { gte: cutoff, lte: now },
            },
            select: {
              kind: true,
              userId: true,
              created: true,
              standard: { select: { family: true, revision: true } },
            },
          })
        : [],
      g.includes("maintenance")
        ? db.maintenancePlan.findMany({
            where: {
              equipmentId: { in: ids },
              active: true,
              ...(!team ? { assigneeId: u.id } : {}),
            },
            orderBy: [{ nextDue: "asc" }, { id: "asc" }],
            take: 501,
            select: {
              id: true,
              title: true,
              equipmentId: true,
              assigneeId: true,
              nextDue: true,
              kind: true,
            },
          })
        : [],
      g.includes("defects")
        ? db.$queryRaw<
            any[]
          >`SELECT id,title,"equipmentId","assigneeId",priority,"createdAt" FROM "Defect" WHERE "equipmentId"=ANY(${ids}::text[]) AND status='Open' AND (${team} OR "reportedBy"=${u.id} OR "assigneeId"=${u.id}) ORDER BY CASE priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END,"createdAt",id LIMIT 501`
        : [],
      g.includes("problems")
        ? db.problemAction.findMany({
            where: {
              problem: {
                equipmentId: { in: ids },
                status: { not: "Closed" },
              },
              status: { not: "Completed" },
              ...(!team ? { ownerId: u.id } : {}),
            },
            orderBy: [{ dueDate: "asc" }, { id: "asc" }],
            take: 501,
            select: {
              id: true,
              title: true,
              ownerId: true,
              dueDate: true,
              problem: {
                select: { id: true, reference: true, equipmentId: true },
              },
            },
          })
        : [],
      g.includes("ideas")
        ? db.idea.findMany({
            where: {
              equipmentId: { in: ids },
              status: { not: "Completed" },
              ...(!team
                ? {
                    OR: [
                      { pilotId: u.id },
                      { validatorId: u.id },
                      { submitterId: u.id },
                      { participants: { some: { userId: u.id } } },
                    ],
                  }
                : {}),
            },
            orderBy: [{ dueDate: "asc" }, { id: "asc" }],
            take: 501,
            select: {
              id: true,
              title: true,
              equipmentId: true,
              dueDate: true,
              status: true,
              validatorId: true,
              pilotId: true,
            },
          })
        : [],
      g.includes("problems")
        ? db.problem.findMany({
            where: {
              equipmentId: { in: ids },
              status: { not: "Closed" },
              ...(!team ? { AND: [{ OR: [{ ownerId: u.id }, { reviewerId: u.id }] }] } : {}),
            },
            orderBy: [{ dueDate: "asc" }, { id: "asc" }],
            take: 501,
            select: {
              id: true,
              reference: true,
              title: true,
              equipmentId: true,
              dueDate: true,
              status: true,
              ownerId: true,
              reviewerId: true,
            },
          })
        : [],
    ]);
    // Explicit standard assignments must remain discoverable even before a shift requirement is configured.
    const assignedStandards = !team
      ? await db.$queryRaw<any[]>`
      SELECT * FROM (SELECT DISTINCT ON (family) id,family,title,kind,workflow,archived,"equipmentId","assigneeIds" FROM "Standard" WHERE "equipmentId"=ANY(${ids}::text[]) ORDER BY family,revision DESC) s
      WHERE NOT archived AND "assigneeIds" @> ${JSON.stringify([u.id])}::jsonb AND kind=ANY(${[...(g.includes("work") ? ["run"] : []), ...(g.includes("audits") ? ["audit"] : [])]}::text[])
      ORDER BY title,id LIMIT 501`
      : [];
    const completedStandards = assignedStandards.length
      ? await db.record.findMany({
          where: {
            userId: u.id,
            standardId: { in: assignedStandards.map((s) => s.id) },
            kind: { in: ["run", "audit"] },
          },
          select: { standardId: true },
          distinct: ["standardId"],
        })
      : [];
    const completedIds = new Set(completedStandards.map((r) => r.standardId));
    const names = new Map(people.map((v) => [v.id, v.name])),
      scheduled = scheduledQueue({
        schedules: schedules.slice(0, 1000),
        standards: [...baseline, ...recent],
        records,
        userId: u.id,
        team,
        grants: g,
        people: names,
        now,
      });
    const items: QueueItem[] = [...scheduled.rows];
    for (const s of assignedStandards.slice(0, 500)) {
      if (scheduled.rows.some((r) => r.filters.standard === s.id)) continue;
      const recurring = schedules.some(
        (plan) =>
          plan.family === s.family &&
          (!(plan.assigneeIds as string[]).length || (plan.assigneeIds as string[]).includes(u.id))
      );
      const completed = !recurring && completedIds.has(s.id);
      items.push({
        id: `assigned-standard:${s.id}`,
        type: "Assigned checklist",
        title: s.title,
        equipmentId: s.equipmentId,
        assignee: u.name,
        due: "",
        status: recurring ? "Upcoming" : completed ? "Completed" : "Assigned",
        priority: recurring ? 5 : completed ? 6 : 4,
        tab:
          s.workflow === "leader"
            ? "DL/TL Standard Work"
            : s.workflow === "changeover"
              ? "Changeover standards"
              : s.kind === "audit"
                ? "Standard work audits"
                : "Standard work",
        filters: { equipment: s.equipmentId, standard: s.id },
        canPerform: !recurring && !completed,
        detail: recurring
          ? "Shift requirement configured; not due in the displayed shift windows."
          : "Explicit assignment; add a shift requirement for recurring work.",
      });
    }
    for (const v of plans.slice(0, 500)) {
      const overdue = v.nextDue < today,
        due = v.nextDue <= today;
      items.push({
        id: v.id,
        type: v.kind === "cil" ? "CIL" : "PM",
        title: v.title,
        equipmentId: v.equipmentId,
        assignee: names.get(v.assigneeId) || "Reassignment needed",
        due: v.nextDue,
        status: overdue ? "Overdue" : due ? "Due today" : "Upcoming",
        priority: overdue ? 2 : due ? 3 : 5,
        tab: v.kind === "cil" ? "TPM / CIL" : "Preventive maintenance",
        filters: { equipment: v.equipmentId, item: v.id },
        canPerform: due && (v.assigneeId === u.id || u.role === "Admin"),
      });
    }
    for (const v of defects.slice(0, 500))
      items.push({
        id: v.id,
        type: "Defect",
        title: v.title,
        equipmentId: v.equipmentId,
        assignee: v.assigneeId ? names.get(v.assigneeId) || "Reassignment needed" : "Unassigned",
        due: v.createdAt.toISOString(),
        status: ["Critical", "High"].includes(v.priority) ? "Urgent" : "Open",
        priority: v.priority === "Critical" ? 0 : v.priority === "High" ? 1 : 4,
        tab: "Defect reporting",
        filters: { equipment: v.equipmentId, item: v.id },
        canPerform: false,
        detail: v.priority + " priority",
      });
    for (const v of actions.slice(0, 500))
      items.push({
        id: v.id,
        type: "Problem action",
        title: `${v.problem.reference} · ${v.title}`,
        equipmentId: v.problem.equipmentId,
        assignee: names.get(v.ownerId) || "Reassignment needed",
        due: v.dueDate,
        status: v.dueDate < today ? "Overdue" : "Open",
        priority: v.dueDate < today ? 2 : 4,
        tab: "Problem solving",
        filters: { equipment: v.problem.equipmentId, item: v.problem.id },
        canPerform: false,
      });
    for (const v of ideas.slice(0, 500))
      items.push({
        id: v.id,
        type: "Improvement idea",
        title: v.title,
        equipmentId: v.equipmentId,
        assignee: names.get(v.status === "Validation" ? v.validatorId : v.pilotId) || "Reassignment needed",
        due: v.dueDate,
        status: v.status === "Validation" ? "Awaiting validation" : v.dueDate < today ? "Overdue" : "Open",
        priority: v.dueDate < today ? 2 : 4,
        tab: "Improvement ideas",
        filters: { equipment: v.equipmentId, item: v.id },
        canPerform: false,
      });
    for (const v of cases.slice(0, 500))
      items.push({
        id: v.id,
        type: "Investigation",
        title: `${v.reference} · ${v.title}`,
        equipmentId: v.equipmentId,
        assignee: names.get(v.status === "Verification" ? v.reviewerId : v.ownerId) || "Reassignment needed",
        due: v.dueDate,
        status:
          v.status === "Verification"
            ? "Awaiting validation"
            : v.dueDate < today
              ? "Overdue"
              : v.dueDate === today
                ? "Due today"
                : "Upcoming",
        priority: v.dueDate < today ? 2 : 3,
        tab: "Problem solving",
        filters: { equipment: v.equipmentId, item: v.id },
        canPerform: false,
      });
    items.sort(queueOrder);
    const handovers = g.includes("audits")
      ? await db.record.findMany({
          where: {
            kind: "audit",
            standard: { equipmentId: { in: ids } },
            created: { gte: new Date(+now - 86400000), lte: now },
            data: { path: ["snapshot", "workflow"], equals: "leader" },
            ...(!g.includes("analytics") ? { userId: u.id } : {}),
          },
          orderBy: [{ created: "desc" }, { id: "desc" }],
          take: 20,
          select: {
            id: true,
            created: true,
            data: true,
            standard: { select: { equipmentId: true } },
          },
        })
      : [];
    const counts: Record<string, number> = {};
    for (const v of items.slice(0, 500)) counts[v.status] = (counts[v.status] || 0) + 1;
    return Response.json({
      items: items.slice(0, 500),
      counts,
      equipment,
      scope,
      canTeam,
      today,
      timezone: config.timezone,
      currentShift: (() => {
        const w = nearbyShifts(config, now).find((w) => +w.end > +now);
        if (!w) return "";
        const names = (config.crews || [])
          .filter((c) => c.shiftName === w.name && crewWorks(c, w.date))
          .map((c) => c.name);
        return names.length ? `${names.join(" / ")} · ${w.name}` : w.name;
      })(),
      truncated:
        scheduled.truncated ||
        schedules.length > 1000 ||
        items.length > 500 ||
        [plans, defects, actions, ideas, cases, assignedStandards].some((v) => v.length > 500),
      hasSchedules: schedules.length > 0,
      window: "Current shift and previous 24 hours; PM/CIL and actions use their displayed due dates",
      generatedAt: now.toISOString(),
      handovers: handovers.map((r) => ({
        id: r.id,
        equipmentId: r.standard?.equipmentId,
        created: r.created,
        shift: (r.data as any)?.handoff?.shift || "",
        notes: (r.data as any)?.handoff?.notes || "",
        rooms: ((r.data as any)?.handoff?.rooms || []).map((room: any) => ({
          room: room.room,
          issues: room.issues,
          remaining: room.remaining,
        })),
      })),
    });
  } catch (e) {
    return failure(e);
  }
}
