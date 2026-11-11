import { canAdminister } from "@/lib/capabilities";
import { requireDelegated } from "@/lib/security";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireUser,
  grants,
  jsonBody,
  failure,
  HttpError,
} from "@/lib/security";
import { visibleAreas, assertAreaAccess, allowedArea } from "@/lib/area-access";
import { ownEvidence } from "@/lib/evidence";
import {
  fiveSPlanSchema,
  fiveSResponse,
  validateFiveS,
} from "@/lib/floor-rules";
import { readFilters } from "@/lib/filters";
import { paged, streamWorkbook } from "@/lib/excel-stream";
export async function GET(req: Request) {
  try {
    const u = await requireUser("fiveS"),
      areas = await visibleAreas(u),
      ids = areas.map((l) => l.id),
      { person, search } = readFilters(req.url),
      params = new URL(req.url).searchParams;
    const plans = await db.fiveSPlan.findMany({
      where: {
        locationId: { in: ids },
        ...(person ? { assigneeIds: { array_contains: [person] } } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" as const } },
                {
                  locationId: {
                    in: areas
                      .filter((a) =>
                        [a.plant, a.department, a.area, a.line]
                          .join(" ")
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((a) => a.id),
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { title: "asc" },
    });
    const where = {
      locationId: { in: ids },
      ...(person ? { userId: person } : {}),
      ...(search ? { planId: { in: plans.map((p) => p.id) } } : {}),
    };
    if (params.get("format") === "xlsx") {
      await requireUser("export");
      return await streamWorkbook(
        "floorwork-5s.xlsx",
        async (book) => {
          const sheet = book.addWorksheet("5S audits");
          await sheet.addRow([
            "ID",
            "Title",
            "Area",
            "Auditor ID",
            "Completed UTC",
            "Score",
            "Maximum",
            "Responses JSON",
          ]);
          for await (const r of paged((cursor) =>
            db.fiveSAudit.findMany({
              where,
              orderBy: { id: "asc" },
              take: 100,
              ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            }),
          ))
            await sheet.addRow([
              r.id,
              (r.snapshot as any).title,
              areas.find((l) => l.id === r.locationId)?.area,
              r.userId,
              r.createdAt,
              r.score,
              r.maximum,
              JSON.stringify(r.responses),
            ]);
        },
        req.signal,
      );
    }
    const people = (
      await db.user.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          workspaceAccess: true,
        },
        orderBy: { name: "asc" },
      })
    )
      .filter((p) => areas.some((l) => allowedArea(p, l)))
      .map(({ workspaceAccess, ...p }) => p);
    const records = await db.fiveSAudit.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return Response.json({
      userId: u.id,
      plans,
      records,
      areas,
      people,
      canManage:
        (await grants(u)).includes("manage") ||
        (await canAdminister(u, "fiveS.manage")),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser("fiveS"),
      b = await jsonBody(req),
      entry = { at: new Date().toISOString(), by: u.id, name: u.name };
    if (b.action === "retire") {
      await requireDelegated("fiveS.manage", "manage");
      const id = z.string().uuid().parse(b.id),
        version = z.number().int().positive().parse(b.version);
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "FiveSPlan" WHERE id=${id} FOR UPDATE`;
        const plan = await tx.fiveSPlan.findUnique({ where: { id } });
        if (!plan) throw new HttpError(404, "Plan not found");
        await assertAreaAccess(u, plan.locationId, tx);
        const links = await tx.$queryRaw<
          { id: string }[]
        >`SELECT s.id FROM "Standard" s JOIN (SELECT family,max(revision) revision FROM "Standard" GROUP BY family) latest ON s.family=latest.family AND s.revision=latest.revision WHERE NOT s.archived AND s.steps @> ${JSON.stringify([{ fiveSPlanId: id }])}::jsonb LIMIT 1`;
        if (links.length)
          throw new HttpError(
            409,
            "Remove this 5S link from active standard-work checklists before retiring the plan.",
          );
        const updated = await tx.fiveSPlan.updateMany({
          where: { id, version },
          data: {
            active: false,
            version: { increment: 1 },
            history: [
              ...(plan.history as any[]),
              { ...entry, action: "retired" },
            ],
          },
        });
        if (!updated.count)
          throw new HttpError(409, "Plan changed; refresh before retiring");
      });
      return Response.json({ ok: true });
    }
    if (b.action === "save") {
      await requireDelegated("fiveS.manage", "manage");
      const v = fiveSPlanSchema.parse(b),
        id = z.string().uuid().optional().parse(b.id),
        version = z.number().int().optional().parse(b.version);
      await db.$transaction(async (tx) => {
        const area = await assertAreaAccess(u, v.locationId, tx);
        const people = await tx.user.findMany({
          where: { id: { in: [...new Set(v.assigneeIds)] }, active: true },
        });
        if (
          people.length !== new Set(v.assigneeIds).size ||
          people.some((p) => !allowedArea(p, area))
        )
          throw new HttpError(
            400,
            "Assign active people with access to this area",
          );
        if (id) {
          await tx.$queryRaw`SELECT id FROM "FiveSPlan" WHERE id=${id} FOR UPDATE`;
          const old = await tx.fiveSPlan.findUnique({ where: { id } });
          if (!old || old.version !== version)
            throw new HttpError(409, "5S plan changed; reload");
          if (old.locationId !== v.locationId)
            throw new HttpError(
              400,
              "Create a new 5S plan for another area; existing plans keep their area",
            );
          await assertAreaAccess(u, old.locationId, tx);
          await tx.fiveSPlan.update({
            where: { id },
            data: {
              ...v,
              version: { increment: 1 },
              history: [...(old.history as any[]), { ...entry, values: v }],
            },
          });
        } else
          await tx.fiveSPlan.create({
            data: { ...v, createdBy: u.id, history: [{ ...entry, values: v }] },
          });
      });
    } else if (b.action === "complete") {
      const v = z
        .object({
          id: z.string().uuid(),
          version: z.number().int(),
          responses: z.array(fiveSResponse).max(100),
        })
        .parse(b);
      const result = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "FiveSPlan" WHERE id=${v.id} FOR SHARE`;
        const p = await tx.fiveSPlan.findUnique({ where: { id: v.id } });
        if (!p?.active || p.version !== v.version)
          throw new HttpError(409, "5S plan changed; reload");
        const area = await assertAreaAccess(u, p.locationId, tx);
        if (
          u.role !== "Admin" &&
          (p.assigneeIds as string[]).length &&
          !(p.assigneeIds as string[]).includes(u.id)
        )
          throw new HttpError(
            403,
            "This 5S audit is assigned to another person",
          );
        let scores;
        try {
          scores = validateFiveS(p.questions as any, v.responses);
        } catch {
          throw new HttpError(
            400,
            "Answer each question and attach required evidence",
          );
        }
        const media = v.responses.flatMap((r) => r.media);
        await ownEvidence(u.id, media, [], tx);
        const { history, ...snapshot } = p;
        return await tx.fiveSAudit.create({
          data: {
            planId: p.id,
            locationId: p.locationId,
            userId: u.id,
            snapshot: JSON.parse(JSON.stringify({ ...snapshot, area })),
            responses: v.responses,
            media,
            ...scores,
          },
        });
      });
      return Response.json({ ok: true, id: result.id });
    } else throw new HttpError(400, "Unknown 5S action");
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
