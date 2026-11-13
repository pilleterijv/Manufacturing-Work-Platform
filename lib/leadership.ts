import { readFilters } from "./filters";
import {
  assignedEquipmentIds,
  equipmentIds,
  equipmentSql,
  visiblePeople,
  type ScopedUser,
} from "./location-access";
import { Temporal } from "@js-temporal/polyfill";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  dateSchema,
  ShiftConfig,
  splitDowntime,
  localToday,
} from "./operations-rules";
import { HttpError } from "./security";
import { paged } from "./paged";

type Counts = {
  runs: number;
  studies: number;
  audits: number;
  leaderWork: number;
  leaderFollowUps: number;
  auditFollowUps: number;
  averageCompletionSeconds: number | null;
};
type CycleStats = {
  count: number;
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  range: number | null;
  standardDeviation: number | null;
};
export async function leadershipReport(
  params: URLSearchParams,
  user: ScopedUser,
) {
  const ids = await equipmentIds(user);
  const { person, search } = readFilters("http://localhost/?" + params);
  const assignmentIds = await assignedEquipmentIds(ids, person);
  const permitted = { equipmentId: { in: ids } };
  const matchingIds = search
    ? (
        await db.equipment.findMany({
          where: {
            id: { in: ids },
            OR: ["name", "plant", "department", "area", "line"].map((k) => ({
              [k]: { contains: search, mode: "insensitive" },
            })),
          },
          select: { id: true },
        })
      ).map((e) => e.id)
    : [];
  const problemFilter = {
    ...permitted,
    AND: [
      ...(person
        ? [
            {
              OR: [
                { ownerId: person },
                { reviewerId: person },
                { actions: { some: { ownerId: person } } },
              ],
            },
          ]
        : []),
      ...(search
        ? [
            {
              OR: [
                { title: { contains: search, mode: "insensitive" as const } },
                { equipmentId: { in: matchingIds } },
              ],
            },
          ]
        : []),
    ],
  };
  const setting = await db.setting.findUniqueOrThrow({
    where: { key: "shifts" },
  });
  const config = setting.value as ShiftConfig;
  const today = localToday(config.timezone);
  const from = dateSchema.parse(
    params.get("from") ??
      Temporal.PlainDate.from(today).subtract({ days: 29 }).toString(),
  );
  const to = dateSchema.parse(params.get("to") ?? today);
  const first = Temporal.PlainDate.from(from),
    last = Temporal.PlainDate.from(to);
  if (
    Temporal.PlainDate.compare(first, last) > 0 ||
    first.until(last).days > 365
  )
    throw new HttpError(400, "Choose a reporting range of 1–366 days");
  const start = new Date(
    first.toZonedDateTime(config.timezone).epochMilliseconds,
  );
  const end = new Date(
    last.add({ days: 1 }).toZonedDateTime(config.timezone).epochMilliseconds,
  );
  const now = new Date();
  const department = params.get("department") ?? "";
  if (department.length > 100) throw new HttpError(400, "Invalid department");
  // Aggregate JSON observations inside PostgreSQL rather than retaining all raw
  // records/cycles in the Node heap. Parameters remain bound, never interpolated.
  const recordScope = Prisma.sql`FROM "Record" r LEFT JOIN "Equipment" e
    ON e.id = COALESCE(r.data->>'equipmentId', r.data->'snapshot'->>'equipmentId')
    WHERE r.created >= ${start} AND r.created < ${end}
    AND ${equipmentSql(ids, Prisma.sql`e.id`)}
    ${person ? Prisma.sql`AND r."userId"=${person}` : Prisma.empty}
    ${search ? Prisma.sql`AND (r.data::text ILIKE ${"%" + search + "%"} OR e.id=ANY(${matchingIds}::text[]))` : Prisma.empty}
    ${department ? Prisma.sql`AND COALESCE(r.data->'equipmentSnapshot'->>'department', r.data->'snapshot'->'equipment'->>'department', e.department) = ${department}` : Prisma.empty}`;
  const base = Prisma.sql`WITH scoped AS (SELECT r.kind, r.data ${recordScope})`;
  const ideaScope = Prisma.sql`WHERE ${equipmentSql(ids, Prisma.sql`"equipmentId"`)} ${person ? Prisma.sql`AND ("pilotId"=${person} OR "validatorId"=${person} OR "submitterId"=${person} OR "createdBy"=${person} OR id IN (SELECT "ideaId" FROM "IdeaParticipant" WHERE "userId"=${person}))` : Prisma.empty} ${search ? Prisma.sql`AND (title ILIKE ${"%" + search + "%"} OR "equipmentId"=ANY(${matchingIds}::text[]))` : Prisma.empty} ${department ? Prisma.sql`AND "equipmentSnapshot"->>'department'=${department}` : Prisma.empty}`;
  const [
    countRows,
    responseRows,
    cycleRows,
    ideas,
    libraryRows,
    latestRows,
    equipmentCount,
    people,
    departmentRows,
    problemGroups,
    problemActions,
  ] = await Promise.all([
    db.$queryRaw<Counts[]>(Prisma.sql`${base} SELECT
      (count(*) FILTER (WHERE kind='run'))::int AS runs,
      (count(*) FILTER (WHERE kind='study'))::int AS studies,
      (count(*) FILTER (WHERE kind='audit'))::int AS audits,
      (count(*) FILTER (WHERE kind='audit' AND data#>>'{snapshot,workflow}'='leader'))::int AS "leaderWork",
      (count(*) FILTER (WHERE kind='audit' AND data#>>'{snapshot,workflow}'='leader' AND data->>'followUp'='true'))::int AS "leaderFollowUps",
      (count(*) FILTER (WHERE kind='audit' AND data->>'followUp'='true'))::int AS "auditFollowUps",
      avg((data->>'durationSeconds')::double precision) FILTER (WHERE kind='run') AS "averageCompletionSeconds" FROM scoped`),
    db.$queryRaw<{ responses: number; noAnswers: number }[]>(Prisma.sql`${base}
      SELECT count(*)::int AS responses, (count(*) FILTER (WHERE a->>'answer'='false'))::int AS "noAnswers"
      FROM scoped, LATERAL jsonb_array_elements(COALESCE(data->'responses','[]'::jsonb)) a WHERE kind='run'`),
    db.$queryRaw<CycleStats[]>(Prisma.sql`${base}, observations AS (
      SELECT (c->>'seconds')::double precision AS seconds FROM scoped,
      LATERAL jsonb_array_elements(COALESCE(data->'cycles','[]'::jsonb)) c WHERE kind='study')
      SELECT count(*)::int AS count, avg(seconds) AS average,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds) AS median,
      min(seconds) AS min, max(seconds) AS max, max(seconds)-min(seconds) AS range,
      stddev_pop(seconds) AS "standardDeviation" FROM observations`),
    db.$queryRaw<
      { status: string; total: number; overdue: number; created: number }[]
    >(Prisma.sql`
      SELECT status, count(*)::int AS total,
      (count(*) FILTER (WHERE "dueDate" < ${today}))::int AS overdue,
      (count(*) FILTER (WHERE "createdAt" >= ${start} AND "createdAt" < ${end}))::int AS created
      FROM "Idea" ${ideaScope} GROUP BY status`),
    db.$queryRaw<
      { kind: string; total: number }[]
    >(Prisma.sql`SELECT c.kind,count(*)::int AS total
      FROM "Content" c LEFT JOIN "Equipment" e ON e.id=c."equipmentId" WHERE c.active AND (c."equipmentId" IS NULL OR ${equipmentSql(assignmentIds, Prisma.sql`c."equipmentId"`)})
      ${department ? Prisma.sql`AND (c."equipmentId" IS NULL OR e.department=${department})` : Prisma.empty} GROUP BY c.kind`),
    db.$queryRaw<
      { total: number }[]
    >(Prisma.sql`SELECT count(*)::int AS total FROM (
      SELECT DISTINCT ON (family) "equipmentId" FROM "Standard" WHERE NOT archived ORDER BY family, revision DESC
    ) s JOIN "Equipment" e ON e.id=s."equipmentId"
    WHERE ${equipmentSql(assignmentIds, Prisma.sql`e.id`)} ${department ? Prisma.sql`AND e.department=${department}` : Prisma.empty}`),
    db.equipment.count({
      where: {
        id: { in: assignmentIds },
        ...(department ? { department } : {}),
      },
    }),
    department
      ? Promise.resolve(null)
      : visiblePeople(user, ids).then(
          (p) => p.filter((p) => !person || p.id === person).length,
        ),
    db.equipment.findMany({
      where: { id: { in: ids } },
      select: { department: true },
      distinct: ["department"],
    }),
    db.problem.groupBy({
      by: ["method", "status"],
      where: {
        ...problemFilter,
        ...(department
          ? { equipmentSnapshot: { path: ["department"], equals: department } }
          : {}),
      },
      _count: true,
    }),
    db.problemAction.count({
      where: {
        status: { not: "Completed" },
        problem: {
          ...problemFilter,
          ...(department
            ? {
                equipmentSnapshot: { path: ["department"], equals: department },
              }
            : {}),
        },
      },
    }),
  ]);
  // Scan events in bounded batches; aggregate slices immediately instead of
  // constructing a second full array containing every shift of every event.
  const shifts = new Map<
    string,
    { shift: string; shiftDate: string; timezone: string; seconds: number }
  >();
  const reasons = new Map<string, number>();
  let downtimeSeconds = 0,
    downtimeEvents = 0,
    activeDowntime = 0;
  const events = paged((cursor) =>
    db.downtime.findMany({
      where: {
        ...permitted,
        AND: [
          ...(person
            ? [{ OR: [{ startedBy: person }, { stoppedBy: person }] }]
            : []),
          ...(search
            ? [
                {
                  OR: [
                    {
                      reasonName: {
                        contains: search,
                        mode: "insensitive" as const,
                      },
                    },
                    { equipmentId: { in: matchingIds } },
                  ],
                },
              ]
            : []),
        ],
        startedAt: { lt: end },
        OR: [{ endedAt: null }, { endedAt: { gt: start } }],
        ...(department
          ? { equipmentSnapshot: { path: ["department"], equals: department } }
          : {}),
      },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        shiftConfig: true,
        reasonName: true,
      },
      orderBy: { id: "asc" },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  );
  for await (const d of events) {
    if (!d.endedAt) activeDowntime++;
    const a = new Date(Math.max(+d.startedAt, +start)),
      b = new Date(Math.min(+(d.endedAt ?? now), +end));
    if (+b <= +a) continue;
    downtimeEvents++;
    const timezone = (d.shiftConfig as ShiftConfig).timezone;
    for (const s of splitDowntime(a, b, d.shiftConfig as ShiftConfig)) {
      const key = JSON.stringify([timezone, s.shiftDate, s.shift]);
      const current = shifts.get(key) ?? {
        shift: s.shift,
        shiftDate: s.shiftDate,
        timezone,
        seconds: 0,
      };
      current.seconds += s.seconds;
      shifts.set(key, current);
      reasons.set(d.reasonName, (reasons.get(d.reasonName) ?? 0) + s.seconds);
      downtimeSeconds += s.seconds;
    }
  }
  return {
    from,
    to,
    timezone: config.timezone,
    department,
    generatedAt: now.toISOString(),
    departments: departmentRows
      .map((r) => r.department)
      .filter((d): d is string => Boolean(d))
      .sort(),
    summary: {
      equipment: equipmentCount,
      standards: latestRows[0].total,
      ...countRows[0],
      ...responseRows[0],
      observations: cycleRows[0].count,
      cycleStats: cycleRows[0].count ? cycleRows[0] : null,
      downtimeSeconds,
      downtimeEvents,
      activeDowntime,
      ideasCreated: ideas.reduce((s, i) => s + i.created, 0),
      openIdeas: ideas
        .filter((i) => i.status !== "Completed")
        .reduce((s, i) => s + i.total, 0),
      overdueIdeas: ideas
        .filter((i) => i.status !== "Completed")
        .reduce((s, i) => s + i.overdue, 0),
      completedIdeas: ideas.find((i) => i.status === "Completed")?.total ?? 0,
      training: libraryRows.find((r) => r.kind === "video")?.total ?? 0,
      guides: libraryRows.find((r) => r.kind === "guide")?.total ?? 0,
      activePeople: people,
      openProblems: problemGroups
        .filter((p) => p.status !== "Closed")
        .reduce((n, p) => n + p._count, 0),
      closedProblems: problemGroups
        .filter((p) => p.status === "Closed")
        .reduce((n, p) => n + p._count, 0),
      openProblemActions: problemActions,
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
        ideas.find((i) => i.status === status)?.total ?? 0,
      ]),
    ),
  };
}
