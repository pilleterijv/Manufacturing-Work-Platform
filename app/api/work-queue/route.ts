import { crewWorks } from "@/lib/crew-rotation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, grants, failure, HttpError } from "@/lib/security";
import { equipmentIds, visiblePeople } from "@/lib/location-access";
import { focusedEquipmentIds } from "@/lib/equipment-label";
import { localToday, shiftConfigSchema } from "@/lib/operations-rules";
import {
  nearbyShifts,
  scheduledQueue,
  queueOrder,
  type QueueItem,
} from "@/lib/work-queue-rules";
export async function GET(req: Request) {
  try {
    const u = await requireUser(),
      g = await grants(u),
      p = new URL(req.url).searchParams,
      scope = z.enum(["my", "team"]).parse(p.get("scope") || "my"),
      team = scope === "team";
    const canTeam =
      ["Admin", "Manager", "DL/TL"].includes(u.role) &&
      (g.includes("dashboard") ||
        g.includes("leadership") ||
        g.includes("analytics"));
    if (team && !canTeam)
      throw new HttpError(
        403,
        "Department review is not assigned to this account",
      );
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
            (!area || e.area === area),
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
    const [baseline, recent, records, plans, defects, actions, ideas, cases] =
      await Promise.all([
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
                    ...(g.includes("work") || (team && g.includes("analytics"))
                      ? ["run"]
                      : []),
                    ...(g.includes("audits") ||
                    (team && g.includes("analytics"))
                      ? ["audit"]
                      : []),
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
                OR: [{ dueDate: { lte: today } }, { status: "Verification" }],
                ...(!team
                  ? { AND: [{ OR: [{ ownerId: u.id }, { reviewerId: u.id }] }] }
                  : {}),
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
        assignee: v.assigneeId
          ? names.get(v.assigneeId) || "Reassignment needed"
          : "Unassigned",
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
        assignee:
          names.get(v.status === "Validation" ? v.validatorId : v.pilotId) ||
          "Reassignment needed",
        due: v.dueDate,
        status:
          v.status === "Validation"
            ? "Awaiting validation"
            : v.dueDate < today
              ? "Overdue"
              : "Open",
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
        assignee:
          names.get(v.status === "Verification" ? v.reviewerId : v.ownerId) ||
          "Reassignment needed",
        due: v.dueDate,
        status:
          v.status === "Verification"
            ? "Awaiting validation"
            : v.dueDate < today
              ? "Overdue"
              : "Due today",
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
    for (const v of items.slice(0, 500))
      counts[v.status] = (counts[v.status] || 0) + 1;
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
        [plans, defects, actions, ideas, cases].some((v) => v.length > 500),
      hasSchedules: schedules.length > 0,
      window:
        "Current shift and previous 24 hours; PM/CIL and actions use their displayed due dates",
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
