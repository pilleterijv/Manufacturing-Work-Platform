import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, grants, failure, HttpError } from "@/lib/security";
import { adminPrivileges } from "@/lib/capabilities";
import { canOpenSection } from "@/lib/navigation";
import { equipmentIds, recordScope } from "@/lib/location-access";
import { visibleAreas } from "@/lib/area-access";
import { searchSettings } from "@/lib/section-search";
export async function GET(req: Request) {
  try {
    const u = await requireUser(),
      p = new URL(req.url).searchParams,
      section = z.string().max(80).parse(p.get("section")),
      query = z
        .string()
        .trim()
        .max(150)
        .parse(p.get("q") || ""),
      settings = searchSettings(section),
      g = await grants(u);
    if (
      !canOpenSection(
        { role: u.role, grants: g, adminPrivileges: await adminPrivileges(u) },
        section,
      )
    )
      throw new HttpError(403, "This section is not permitted");
    if (!settings)
      throw new HttpError(400, "This section has no record search");
    const ids = await equipmentIds(u),
      text = { contains: query, mode: "insensitive" as const },
      like = "%" + query.replace(/[\\%_]/g, "\\$&") + "%";
    const [equipment, areas] = await Promise.all([
      settings.equipment
        ? db.equipment.findMany({
            where: {
              AND: [
                { id: { in: ids } },
                ...(query
                  ? [
                      {
                        OR: ["name", "plant", "department", "area", "line"].map(
                          (k) => ({ [k]: text }),
                        ),
                      },
                    ]
                  : []),
              ],
            },
            orderBy: { name: "asc" },
            take: 50,
          })
        : [],
      settings.areas ? visibleAreas(u) : [],
    ]);
    const candidates: {
      value: string;
      label: string;
      kind: string;
      searchText?: string;
    }[] = [];
    const add = (value: string, label = value, kind = settings.kind) => {
      if (value) candidates.push({ value, label, kind, searchText: query });
    };
    if (
      [
        "Standard work",
        "DL/TL Standard Work",
        "Standard work audits",
        "Manage",
      ].includes(section)
    ) {
      const rows = await db.$queryRaw<
        { title: string }[]
      >`SELECT s.title FROM "Standard" s JOIN (SELECT family,max(revision) revision FROM "Standard" GROUP BY family) latest ON s.family=latest.family AND s.revision=latest.revision WHERE NOT s.archived AND s."equipmentId"=ANY(${ids}::text[]) AND (${section}='Manage' OR s.kind=CASE WHEN ${section}='Standard work' THEN 'run' ELSE 'audit' END) AND (${section} NOT IN ('DL/TL Standard Work','Standard work audits') OR s.workflow=CASE WHEN ${section}='DL/TL Standard Work' THEN 'leader' ELSE 'process' END) AND (${section} NOT IN ('DL/TL Standard Work','Standard work audits') OR ${u.role}='Admin' OR s."assigneeIds"='[]'::jsonb OR s."assigneeIds" @> ${JSON.stringify([u.id])}::jsonb) AND s.title ILIKE ${like} ORDER BY s.title LIMIT 35`;
      for (const r of rows) add(r.title);
    } else if (section === "Time studies" || section === "Analytics") {
      const records = await db.record.findMany({
        where: {
          kind:
            section === "Time studies"
              ? "study"
              : {
                  in: [
                    "run",
                    "study",
                    ...(g.includes("audits") ? ["audit"] : []),
                  ],
                },
          AND: [
            recordScope(ids),
            ...(g.includes("analytics") ? [] : [{ userId: u.id }]),
            {
              OR: [
                {
                  data: {
                    path: ["title"],
                    string_contains: query,
                    mode: "insensitive",
                  },
                },
                {
                  data: {
                    path: ["snapshot", "title"],
                    string_contains: query,
                    mode: "insensitive",
                  },
                },
              ],
            },
          ],
        },
        select: { data: true },
        orderBy: { created: "desc" },
        take: 50,
      });
      for (const r of records) {
        const d = r.data as any;
        add(d.title || d.snapshot?.title || "");
      }
    } else if (
      section === "Preventive maintenance" ||
      section === "TPM / CIL"
    ) {
      const plans = await db.maintenancePlan.findMany({
        where: {
          equipmentId: { in: ids },
          kind: section === "TPM / CIL" ? "cil" : "pm",
          title: text,
        },
        select: { title: true },
        take: 35,
        orderBy: { title: "asc" },
      });
      for (const r of plans) add(r.title);
    } else if (section === "Centerlines") {
      const rows = await db.centerline.findMany({
        where: {
          equipmentId: { in: ids },
          OR: [{ title: text }, { setup: text }],
        },
        select: { title: true, setup: true },
        take: 35,
        orderBy: { title: "asc" },
      });
      for (const r of rows) {
        if (!query || r.title.toLowerCase().includes(query.toLowerCase()))
          add(r.title);
        if (
          r.setup &&
          (!query || r.setup.toLowerCase().includes(query.toLowerCase()))
        )
          add(r.setup, `${r.setup} · ${r.title}`, "Product / setup");
      }
    } else if (section === "5S audits") {
      const rows = await db.fiveSPlan.findMany({
        where: { locationId: { in: areas.map((x) => x.id) }, title: text },
        select: { title: true },
        take: 35,
        orderBy: { title: "asc" },
      });
      for (const r of rows) add(r.title);
    } else if (section === "Problem solving") {
      const rows = await db.problem.findMany({
        where: {
          equipmentId: { in: ids },
          OR: [{ title: text }, { reference: text }],
        },
        select: { title: true, reference: true, method: true },
        take: 35,
        orderBy: { updatedAt: "desc" },
      });
      for (const r of rows)
        add(
          r.reference,
          `${r.reference} · ${r.title}`,
          `${r.method} investigation`,
        );
    } else if (section === "Defect reporting") {
      const rows = await db.defect.findMany({
        where: {
          equipmentId: { in: ids },
          OR: [
            { title: text },
            { description: text },
            { maintainxId: text },
            { id: text },
          ],
        },
        select: { id: true, title: true, maintainxId: true },
        take: 35,
        orderBy: { createdAt: "desc" },
      });
      for (const r of rows) {
        add(r.title);
        if (r.maintainxId && (!query || r.maintainxId.includes(query)))
          add(
            r.maintainxId,
            `${r.maintainxId} · ${r.title}`,
            "MaintainX work order",
          );
      }
    } else if (section === "Improvement ideas") {
      const rows = await db.idea.findMany({
        where: {
          equipmentId: { in: ids },
          OR: [{ title: text }, { currentState: text }, { proposal: text }],
        },
        select: { title: true },
        take: 35,
        orderBy: { createdAt: "desc" },
      });
      for (const r of rows) add(r.title);
    } else if (section === "Training" || section === "Troubleshooting") {
      const rows = await db.content.findMany({
        where: {
          active: true,
          kind: section === "Training" ? "video" : "guide",
          OR: [{ equipmentId: null }, { equipmentId: { in: ids } }],
          AND: [
            {
              OR: [
                { title: text },
                ...(section === "Troubleshooting" ? [{ body: text }] : []),
              ],
            },
          ],
        },
        select: { title: true },
        take: 35,
        orderBy: { title: "asc" },
      });
      for (const r of rows) add(r.title);
    } else if (section === "Downtime") {
      const rows = await db.downtime.findMany({
        where: { equipmentId: { in: ids }, reasonName: text },
        select: { reasonName: true },
        distinct: ["reasonName"],
        take: 35,
      });
      for (const r of rows) add(r.reasonName);
    } else if (section === "Production results") {
      const feeds = await db.externalFeed.findMany({
          where: { section, active: true },
          select: { id: true, sourceId: true },
        }),
        sources = await db.integrationSource.findMany({
          where: { active: true },
          select: { id: true },
        });
      const feedIds = feeds
        .filter((f) => sources.some((s) => s.id === f.sourceId))
        .map((f) => f.id);
      const rows = await db.externalRow.findMany({
        where: {
          feedId: { in: feedIds },
          equipmentId: { in: ids },
          OR: [{ title: text }, { externalId: text }, { details: text }],
        },
        select: { title: true, externalId: true },
        take: 35,
        orderBy: { occurredAt: "desc" },
      });
      for (const r of rows) add(r.externalId, `${r.externalId} · ${r.title}`);
    }
    // Suggestions describe fields this tab actually searches, rather than unrelated recent records.
    for (const e of equipment) {
      add(
        e.name,
        [e.name, e.department, e.area, e.line].filter(Boolean).join(" · "),
        "Machine",
      );
      for (const [kind, value] of [
        ["Department", e.department],
        ["Area", e.area],
        ["Line", e.line],
      ] as const)
        if (
          value &&
          (!query || value.toLowerCase().includes(query.toLowerCase()))
        )
          add(
            value,
            [value, e.department, e.plant].filter(Boolean).join(" · "),
            kind,
          );
    }
    for (const a of areas)
      for (const [kind, value] of [
        ["Department", a.department],
        ["Area", a.area],
        ["Line", a.line],
      ] as const)
        if (
          value &&
          (!query || value.toLowerCase().includes(query.toLowerCase()))
        )
          add(
            value,
            [value, a.department, a.plant].filter(Boolean).join(" · "),
            kind,
          );
    return Response.json({
      options: [
        ...new Map(candidates.map((c) => [c.kind + ":" + c.label, c])).values(),
      ].slice(0, 100),
    });
  } catch (e) {
    return failure(e);
  }
}
