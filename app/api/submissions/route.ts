import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, grants, HttpError, failure } from "@/lib/security";
import { equipmentIds } from "@/lib/location-access";
import { allowedArea } from "@/lib/area-access";
import { recordFilters } from "@/lib/filters";
import { readableSubmissionWhere } from "@/lib/submission-history-policy";
const cursorSchema = z
  .object({
    created: z.iso.datetime(),
    source: z.enum(["record", "fiveS"]),
    id: z.string().uuid(),
  })
  .strict();
const types = [
  "all",
  "operator",
  "leader",
  "process",
  "changeover",
  "study",
  "pm",
  "cil",
  "centerline",
  "fiveS",
] as const;
function recordType(r: any) {
  return r.kind === "run"
    ? r.standard?.workflow === "changeover"
      ? "changeover"
      : "operator"
    : r.kind === "audit"
      ? r.standard?.workflow === "leader"
        ? "leader"
        : "process"
      : r.kind;
}
export async function GET(req: Request) {
  try {
    const u = await requireUser(),
      g = await grants(u),
      p = new URL(req.url).searchParams;
    const source = z
        .enum(["record", "fiveS"])
        .optional()
        .parse(p.get("source") || undefined),
      id = z
        .string()
        .uuid()
        .optional()
        .parse(p.get("id") || undefined);
    if (!!source !== !!id)
      throw new HttpError(400, "Choose a submission and its source");
    const ids = await equipmentIds(u),
      areas = (await db.location.findMany()).filter((l) => allowedArea(u, l)),
      areaIds = areas.map((l) => l.id);
    if (id) {
      const record =
        source === "record"
          ? await db.record.findFirst({
              where: { AND: [readableSubmissionWhere(ids, g, u.id), { id }] },
              include: { user: { select: { name: true } } },
            })
          : g.includes("fiveS") || g.includes("history")
            ? await db.fiveSAudit.findFirst({
                where: { id, locationId: { in: areaIds } },
              })
            : null;
      if (!record)
        throw new HttpError(404, "Submission not found in your assigned area");
      return Response.json(
        {
          source,
          record,
          authorName:
            source === "fiveS"
              ? (
                  await db.user.findUnique({
                    where: { id: record.userId },
                    select: { name: true },
                  })
                )?.name
              : undefined,
          areas:
            source === "fiveS"
              ? areas.filter((a) => a.id === (record as any).locationId)
              : [],
          readOnly: true,
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const scope = z.enum(["area", "mine"]).parse(p.get("scope") || "area"),
      type = z.enum(types).parse(p.get("type") || "all"),
      search = z
        .string()
        .trim()
        .max(150)
        .parse(p.get("search") || ""),
      person = z
        .string()
        .uuid()
        .optional()
        .parse(p.get("person") || undefined),
      equipment = z
        .string()
        .uuid()
        .optional()
        .parse(p.get("equipment") || undefined);
    let cursor: z.infer<typeof cursorSchema> | undefined;
    const raw = p.get("cursor");
    if (raw) {
      try {
        if (raw.length > 1000) throw Error();
        cursor = cursorSchema.parse(
          JSON.parse(Buffer.from(raw, "base64url").toString()),
        );
      } catch {
        throw new HttpError(400, "Invalid submission history cursor");
      }
    }
    const after = (s: "record" | "fiveS", field: "created" | "createdAt") =>
      !cursor
        ? {}
        : {
            OR: [
              { [field]: { lt: new Date(cursor.created) } },
              ...(s > cursor.source
                ? [{ [field]: new Date(cursor.created) }]
                : s === cursor.source
                  ? [
                      {
                        [field]: new Date(cursor.created),
                        id: { lt: cursor.id },
                      },
                    ]
                  : []),
            ],
          };
    const scopedIds = equipment ? ids.filter((x) => x === equipment) : ids;
    const equipmentRows = await db.equipment.findMany({
      where: { id: { in: scopedIds } },
    });
    const matched = search
      ? equipmentRows
          .filter((e) =>
            [e.name, e.plant, e.department, e.area, e.line]
              .join(" ")
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((e) => e.id)
      : [];
    const workflow =
      type === "leader"
        ? "leader"
        : type === "changeover"
          ? "changeover"
          : "process";
    const recordFilter: Prisma.RecordWhereInput =
      type === "all"
        ? {}
        : ["operator", "leader", "process", "changeover"].includes(type)
          ? {
              kind: type === "leader" || type === "process" ? "audit" : "run",
              ...(workflow === "process"
                ? {
                    OR: [
                      {
                        data: {
                          path: ["snapshot", "workflow"],
                          equals: "process",
                        },
                      },
                      {
                        data: {
                          path: ["snapshot", "workflow"],
                          equals: Prisma.AnyNull,
                        },
                      },
                    ],
                  }
                : {
                    data: { path: ["snapshot", "workflow"], equals: workflow },
                  }),
            }
          : { kind: type };
    const matchingAreas = search
      ? areas
          .filter((a) =>
            [a.plant, a.department, a.area, a.line]
              .join(" ")
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((a) => a.id)
      : [];
    const matchingAuthors =
      search && (g.includes("fiveS") || g.includes("history"))
        ? await db.user.findMany({
            where: {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { username: { contains: search, mode: "insensitive" } },
              ],
            },
            select: { id: true },
          })
        : [];
    const [records, audits] = await Promise.all([
      type === "fiveS"
        ? []
        : db.record.findMany({
            where: {
              AND: [
                readableSubmissionWhere(scopedIds, g, u.id),
                recordFilter,
                recordFilters(
                  scope === "mine" ? u.id : person,
                  search,
                  matched,
                  [
                    ["snapshot", "title"],
                    ["planSnapshot", "title"],
                  ],
                ),
                after("record", "created"),
              ],
            },
            select: {
              id: true,
              created: true,
              kind: true,
              userId: true,
              user: { select: { name: true } },
              standard: {
                select: { workflow: true, title: true, equipmentId: true },
              },
            },
            orderBy: [{ created: "desc" }, { id: "desc" }],
            take: 51,
          }),
      (g.includes("fiveS") || g.includes("history")) &&
      ["all", "fiveS"].includes(type) &&
      !equipment
        ? db.fiveSAudit.findMany({
            where: {
              AND: [
                { locationId: { in: areaIds } },
                after("fiveS", "createdAt"),
                ...(scope === "mine" || person
                  ? [{ userId: scope === "mine" ? u.id : person }]
                  : []),
                ...(search
                  ? [
                      {
                        OR: [
                          {
                            snapshot: {
                              path: ["title"],
                              string_contains: search,
                              mode: "insensitive" as const,
                            },
                          },
                          { locationId: { in: matchingAreas } },
                          { userId: { in: matchingAuthors.map((a) => a.id) } },
                        ],
                      },
                    ]
                  : []),
              ],
            },
            select: {
              id: true,
              createdAt: true,
              userId: true,
              locationId: true,
              score: true,
              maximum: true,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 51,
          })
        : [],
    ]);
    const recordIds = records.map((r) => r.id),
      auditIds = audits.map((r) => r.id);
    const [meta, auditMeta] = await Promise.all([
      recordIds.length
        ? db.$queryRaw<
            any[]
          >`SELECT id,COALESCE(data->'snapshot'->>'title',data->'planSnapshot'->>'title',data->>'title','Recorded work') title,COALESCE(data->'snapshot'->>'equipmentId',data->>'equipmentId') "equipmentId",data->>'followUp' "followUp",COALESCE(data->'snapshot'->>'workflow','process') workflow FROM "Record" WHERE id=ANY(${recordIds}::text[])`
        : [],
      auditIds.length
        ? db.$queryRaw<
            any[]
          >`SELECT a.id,a.snapshot->>'title' title,u.name author FROM "FiveSAudit" a LEFT JOIN "User" u ON u.id=a."userId" WHERE a.id=ANY(${auditIds}::text[])`
        : [],
    ]);
    const metadata = new Map(meta.map((m) => [m.id, m])),
      auditMetadata = new Map(auditMeta.map((m) => [m.id, m]));
    const rows = [
      ...records.map((r) => {
        const m = metadata.get(r.id) || {},
          e = equipmentRows.find(
            (e) => e.id === (r.standard?.equipmentId || m.equipmentId),
          );
        return {
          id: r.id,
          source: "record",
          type: recordType({
            ...r,
            standard: r.standard || { workflow: m.workflow },
          }),
          title: r.standard?.title || m.title,
          created: r.created.toISOString(),
          author: r.user.name,
          equipment: e || null,
          area: null,
          status: m.followUp === "true" ? "Follow up" : "Completed",
        };
      }),
      ...audits.map((r) => ({
        id: r.id,
        source: "fiveS",
        type: "fiveS",
        title: auditMetadata.get(r.id)?.title || "5S audit",
        created: r.createdAt.toISOString(),
        author: auditMetadata.get(r.id)?.author || "Former account",
        equipment: null,
        area: areas.find((a) => a.id === r.locationId),
        status: `${r.score}/${r.maximum}`,
      })),
    ].sort(
      (a, b) =>
        b.created.localeCompare(a.created) ||
        a.source.localeCompare(b.source) ||
        b.id.localeCompare(a.id),
    );
    const items = rows.slice(0, 50),
      last = items.at(-1);
    return Response.json(
      {
        items,
        hasMore: rows.length > 50,
        cursor:
          rows.length > 50 && last
            ? Buffer.from(
                JSON.stringify({
                  created: last.created,
                  source: last.source,
                  id: last.id,
                }),
              ).toString("base64url")
            : null,
        generatedAt: new Date().toISOString(),
        equipment: equipmentRows,
        readOnly: true,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
