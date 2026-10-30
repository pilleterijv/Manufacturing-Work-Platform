import { Temporal } from "@js-temporal/polyfill";
import { db } from "./db";
import {
  dateSchema,
  EquipmentSnapshot,
  ShiftConfig,
  splitDowntime,
  localToday,
} from "./operations-rules";
import { HttpError } from "./security";
import { stats } from "./rules";
type LegacyData = {
  equipmentId?: string;
  equipmentSnapshot?: EquipmentSnapshot;
  snapshot?: { equipmentId: string; equipment?: EquipmentSnapshot };
  responses?: { answer: boolean }[];
  durationSeconds?: number;
  cycles?: { seconds: number }[];
  followUp?: boolean;
};
export async function leadershipReport(params: URLSearchParams) {
  const setting = await db.setting.findUniqueOrThrow({
      where: { key: "shifts" },
    }),
    config = setting.value as ShiftConfig;
  const today = localToday(config.timezone);
  const from = dateSchema.parse(
      params.get("from") ??
        Temporal.PlainDate.from(today).subtract({ days: 29 }).toString(),
    ),
    to = dateSchema.parse(params.get("to") ?? today);
  const first = Temporal.PlainDate.from(from),
    last = Temporal.PlainDate.from(to);
  if (
    Temporal.PlainDate.compare(first, last) > 0 ||
    first.until(last).days > 365
  )
    throw new HttpError(400, "Choose a reporting range of 1–366 days");
  const start = new Date(
      first.toZonedDateTime(config.timezone).epochMilliseconds,
    ),
    end = new Date(
      last.add({ days: 1 }).toZonedDateTime(config.timezone).epochMilliseconds,
    ),
    now = new Date();
  const department = params.get("department") ?? "";
  const [equipment, records, down, ideas, content, standards, people] =
    await Promise.all([
      db.equipment.findMany(),
      db.record.findMany({
        where: { created: { gte: start, lt: end } },
        select: { kind: true, data: true },
      }),
      db.downtime.findMany({
        where: {
          startedAt: { lt: end },
          OR: [{ endedAt: null }, { endedAt: { gt: start } }],
        },
      }),
      db.idea.findMany({
        select: {
          equipmentSnapshot: true,
          status: true,
          dueDate: true,
          createdAt: true,
        },
      }),
      db.content.findMany({ where: { active: true } }),
      db.standard.findMany({ orderBy: { revision: "desc" } }),
      db.user.count({ where: { active: true } }),
    ]);
  const byId = new Map(equipment.map((e) => [e.id, e]));
  const matches = (e: EquipmentSnapshot | undefined) =>
    !department || e?.department === department;
  const getRecordEquipment = (d: LegacyData) =>
    d.equipmentSnapshot ??
    d.snapshot?.equipment ??
    byId.get(d.equipmentId ?? d.snapshot?.equipmentId ?? "");
  const selected = records.filter((r) =>
    matches(getRecordEquipment(r.data as LegacyData)),
  );
  const runs = selected
      .filter((r) => r.kind === "run")
      .map((r) => r.data as LegacyData),
    studies = selected
      .filter((r) => r.kind === "study")
      .map((r) => r.data as LegacyData),
    audits = selected
      .filter((r) => r.kind === "audit")
      .map((r) => r.data as LegacyData);
  const responses = runs.flatMap((r) => r.responses ?? []),
    cycles = studies.flatMap((r) => r.cycles ?? []);
  const downtime = down
    .filter((d) => matches(d.equipmentSnapshot as EquipmentSnapshot))
    .flatMap((d) => {
      const a = new Date(Math.max(+d.startedAt, +start)),
        b = new Date(Math.min(+(d.endedAt ?? now), +end));
      return +b > +a
        ? splitDowntime(a, b, d.shiftConfig as ShiftConfig).map((s) => ({
            ...s,
            eventId: d.id,
            reason: d.reasonName,
            department: (d.equipmentSnapshot as EquipmentSnapshot).department,
            equipment: (d.equipmentSnapshot as EquipmentSnapshot).name,
            timezone: (d.shiftConfig as ShiftConfig).timezone,
          }))
        : [];
    });
  const shifts = new Map<
      string,
      { shift: string; shiftDate: string; timezone: string; seconds: number }
    >(),
    reasons = new Map<string, number>();
  for (const s of downtime) {
    const key = JSON.stringify([s.timezone, s.shiftDate, s.shift]);
    const value = shifts.get(key) ?? {
      shift: s.shift,
      shiftDate: s.shiftDate,
      timezone: s.timezone,
      seconds: 0,
    };
    value.seconds += s.seconds;
    shifts.set(key, value);
    reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + s.seconds);
  }
  const pipeline = ideas.filter((i) =>
    matches(i.equipmentSnapshot as EquipmentSnapshot),
  );
  const scopeContent = content.filter(
    (c) => !c.equipmentId || matches(byId.get(c.equipmentId)),
  );
  const latest = standards
    .filter((s, i) => standards.findIndex((v) => v.family === s.family) === i)
    .filter((s) => matches(byId.get(s.equipmentId)));
  return {
    from,
    to,
    timezone: config.timezone,
    department,
    generatedAt: now.toISOString(),
    departments: [
      ...new Set([
        ...equipment.map((e) => e.department),
        ...down.map(
          (e) => (e.equipmentSnapshot as EquipmentSnapshot).department,
        ),
        ...ideas.map(
          (e) => (e.equipmentSnapshot as EquipmentSnapshot).department,
        ),
      ]),
    ].sort(),
    summary: {
      equipment: equipment.filter(matches).length,
      standards: latest.length,
      runs: runs.length,
      noAnswers: responses.filter((a) => !a.answer).length,
      responses: responses.length,
      averageCompletionSeconds:
        stats(
          runs.flatMap((r) =>
            typeof r.durationSeconds === "number" ? [r.durationSeconds] : [],
          ),
        )?.average ?? null,
      studies: studies.length,
      observations: cycles.length,
      cycleStats: stats(cycles.map((c) => c.seconds)),
      audits: audits.length,
      auditFollowUps: audits.filter((a) => a.followUp).length,
      downtimeSeconds: downtime.reduce((a, s) => a + s.seconds, 0),
      downtimeEvents: new Set(downtime.map((s) => s.eventId)).size,
      activeDowntime: down.filter(
        (d) =>
          !d.endedAt &&
          matches(d.equipmentSnapshot as EquipmentSnapshot) &&
          d.startedAt < end,
      ).length,
      ideasCreated: pipeline.filter(
        (i) => i.createdAt >= start && i.createdAt < end,
      ).length,
      openIdeas: pipeline.filter((i) => i.status !== "Completed").length,
      overdueIdeas: pipeline.filter(
        (i) => i.status !== "Completed" && i.dueDate < today,
      ).length,
      completedIdeas: pipeline.filter((i) => i.status === "Completed").length,
      training: scopeContent.filter((c) => c.kind === "video").length,
      guides: scopeContent.filter((c) => c.kind === "guide").length,
      activePeople: department ? null : people,
    },
    shifts: [...shifts.values()].sort(
      (a, b) =>
        b.shiftDate.localeCompare(a.shiftDate) ||
        a.shift.localeCompare(b.shift),
    ),
    reasons: [...reasons]
      .map(([reason, seconds]) => ({ reason, seconds }))
      .sort((a, b) => b.seconds - a.seconds),
    ideaStatuses: Object.fromEntries(
      ["Open", "Piloting", "Validation", "Completed"].map((status) => [
        status,
        pipeline.filter((i) => i.status === status).length,
      ]),
    ),
    downtime,
  };
}
