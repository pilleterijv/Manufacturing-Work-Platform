import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, grants, failure, HttpError } from "@/lib/security";
import { adminPrivileges } from "@/lib/capabilities";
import { canOpenSection } from "@/lib/navigation";
import { equipmentIds, equipmentScope } from "@/lib/location-access";
import { visibleAreas } from "@/lib/area-access";
export async function GET(req: Request) {
  try {
    const u = await requireUser();
    const p = new URL(req.url).searchParams;
    const section = z.string().max(80).parse(p.get("section"));
    const query = z
      .string()
      .max(150)
      .parse(p.get("q") || "");
    if (
      !canOpenSection(
        {
          role: u.role,
          grants: await grants(u),
          adminPrivileges: await adminPrivileges(u),
        },
        section,
      )
    )
      throw new HttpError(403, "This section is not permitted");
    const [equipment, areas] = await Promise.all([
      db.equipment.findMany({
        where: {
          AND: [
            equipmentScope(u),
            ...(query
              ? [
                  {
                    OR: ["name", "department", "area", "line", "plant"].map(
                      (k) => ({
                        [k]: { contains: query, mode: "insensitive" },
                      }),
                    ),
                  },
                ]
              : []),
          ],
        },
        orderBy: { name: "asc" },
        take: 60,
      }),
      visibleAreas(u),
    ]);
    const candidates: { value: string; label: string; kind: string }[] = [];
    const ids = await equipmentIds(u);
    const titleWhere = { contains: query, mode: "insensitive" as const };
    let tasks: { title: string }[] = [];
    if (
      ["Standard work", "DL/TL Standard Work", "Standard work audits"].includes(
        section,
      )
    )
      tasks = await db.$queryRaw<{ title: string }[]>`
      SELECT s.title FROM "Standard" s JOIN (SELECT family,max(revision) revision FROM "Standard" GROUP BY family) latest ON s.family=latest.family AND s.revision=latest.revision
      WHERE NOT s.archived AND (${section} NOT IN ('DL/TL Standard Work','Standard work audits') OR s.workflow=CASE WHEN ${section}='DL/TL Standard Work' THEN 'leader' ELSE 'process' END) AND s."equipmentId"=ANY(${ids}::text[]) AND s.kind=${section !== "Standard work" ? "audit" : "run"}
      AND (${section} NOT IN ('DL/TL Standard Work','Standard work audits') OR ${u.role}='Admin' OR s."assigneeIds"='[]'::jsonb OR s."assigneeIds" @> ${JSON.stringify([u.id])}::jsonb)
      AND s.title ILIKE ${"%" + query + "%"} ORDER BY s.title LIMIT 60`;
    else if (section === "Preventive maintenance" || section === "TPM / CIL")
      tasks = await db.maintenancePlan.findMany({
        where: {
          equipmentId: { in: ids },
          kind: section === "TPM / CIL" ? "cil" : "pm",
          title: titleWhere,
        },
        select: { title: true },
        take: 60,
        orderBy: { title: "asc" },
      });
    else if (section === "5S audits")
      tasks = await db.fiveSPlan.findMany({
        where: {
          locationId: { in: areas.map((a) => a.id) },
          title: titleWhere,
        },
        select: { title: true },
        take: 60,
        orderBy: { title: "asc" },
      });
    else if (section === "Problem solving")
      tasks = await db.problem.findMany({
        where: { equipmentId: { in: ids }, title: titleWhere },
        select: { title: true },
        take: 60,
        orderBy: { title: "asc" },
      });
    else if (section === "Defect reporting")
      tasks = await db.defect.findMany({
        where: { equipmentId: { in: ids }, title: titleWhere },
        select: { title: true },
        take: 60,
        orderBy: { title: "asc" },
      });
    else if (section === "Improvement ideas")
      tasks = await db.idea.findMany({
        where: { equipmentId: { in: ids }, title: titleWhere },
        select: { title: true },
        take: 60,
        orderBy: { title: "asc" },
      });
    else if (section === "Training" || section === "Troubleshooting")
      tasks = await db.content.findMany({
        where: {
          active: true,
          kind: section === "Training" ? "video" : "guide",
          title: titleWhere,
          OR: [{ equipmentId: null }, { equipmentId: { in: ids } }],
        },
        select: { title: true },
        take: 60,
        orderBy: { title: "asc" },
      });
    for (const t of tasks)
      candidates.push({
        value: t.title,
        label: t.title,
        kind: "Task / record",
      });
    for (const e of equipment) {
      candidates.push({
        value: e.name,
        label: [e.name, e.department, e.area, e.line]
          .filter(Boolean)
          .join(" · "),
        kind: "Equipment",
      });
      for (const [kind, value] of [
        ["Department", e.department],
        ["Area", e.area],
        ["Line", e.line],
      ] as const)
        if (value)
          candidates.push({
            value,
            label: [value, e.department, e.plant].filter(Boolean).join(" · "),
            kind,
          });
    }
    for (const a of areas)
      for (const [kind, value] of [
        ["Department", a.department],
        ["Area", a.area],
      ] as const)
        if (value && value.toLowerCase().includes(query.toLowerCase()))
          candidates.push({
            value,
            label: [value, a.department, a.plant].join(" · "),
            kind,
          });
    return Response.json({
      options: [
        ...new Map(candidates.map((c) => [c.kind + ":" + c.label, c])).values(),
      ].slice(0, 100),
    });
  } catch (e) {
    return failure(e);
  }
}
