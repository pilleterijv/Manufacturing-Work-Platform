import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  requireUser,
  requireDelegated,
  grants,
  jsonBody,
  failure,
  HttpError,
} from "@/lib/security";
import { canAdminister } from "@/lib/capabilities";
import {
  equipmentIds,
  assertEquipmentAccess,
  visiblePeople,
  recordScope,
} from "@/lib/location-access";
import { readFilters, recordFilters } from "@/lib/filters";
import {
  centerlineSchema,
  centerlineParameterSchema,
  readingResult,
  type CenterlineParameter,
} from "@/lib/centerline-rules";
import { evidenceSchema, ownEvidence } from "@/lib/evidence";
import { streamWorkbook, paged } from "@/lib/excel-stream";
const responsesSchema = z
  .array(
    z.object({
      parameterId: z.string().uuid(),
      actual: z.string().trim().min(1).max(150),
      comment: z.string().trim().max(1000),
      media: evidenceSchema,
    }),
  )
  .min(1)
  .max(100);
export async function GET(req: Request) {
  try {
    const u = await requireUser("centerlines"),
      ids = await equipmentIds(u),
      { person, search } = readFilters(req.url),
      p = new URL(req.url).searchParams;
    const equipment = await db.equipment.findMany({
      where: { id: { in: ids } },
      orderBy: { name: "asc" },
    });
    const matches = equipment
      .filter((e) =>
        [e.name, e.plant, e.department, e.area, e.line]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
      .map((e) => e.id);
    const where: Prisma.CenterlineWhereInput = {
      equipmentId: { in: ids },
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { setup: { contains: search, mode: "insensitive" } },
              { equipmentId: { in: matches } },
            ],
          }
        : {}),
    };
    const recordWhere: Prisma.RecordWhereInput = {
      kind: "centerline",
      AND: [recordScope(ids), recordFilters(person, search, matches)],
    };
    if (p.get("format") === "xlsx") {
      await requireUser("export");
      return streamWorkbook(
        "floorwork-centerlines.xlsx",
        async (book) => {
          const settings = book.addWorksheet("Centerline settings"),
            audits = book.addWorksheet("Audit readings");
          await settings.addRow([
            "ID",
            "Title",
            "Equipment ID",
            "Product / setup",
            "Version",
            "Active",
            "Parameter",
            "Type",
            "Target",
            "Lower",
            "Upper",
            "Unit",
            "Expected",
            "Instructions",
            "Evidence required",
          ]);
          for await (const c of paged((cursor) =>
            db.centerline.findMany({
              where,
              orderBy: { id: "asc" },
              take: 100,
              ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            }),
          ))
            for (const s of c.parameters as CenterlineParameter[])
              await settings.addRow([
                c.id,
                c.title,
                c.equipmentId,
                c.setup,
                c.version,
                c.active,
                s.name,
                s.kind,
                s.target,
                s.lower,
                s.upper,
                s.unit,
                s.expected,
                s.instructions,
                s.photo,
              ]);
          await audits.addRow([
            "Audit ID",
            "UTC",
            "Recorder",
            "Title",
            "Equipment",
            "Product / setup",
            "Revision",
            "Shift / batch",
            "Parameter",
            "Target",
            "Lower",
            "Upper",
            "Expected",
            "Unit",
            "Raw actual",
            "Parsed actual",
            "Within limits",
            "Comment",
            "Media JSON",
          ]);
          for await (const r of paged((cursor) =>
            db.record.findMany({
              where: recordWhere,
              include: { user: { select: { name: true } } },
              take: 100,
              orderBy: { id: "asc" },
              ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            }),
          )) {
            const d = r.data as any;
            for (const a of d.responses) {
              const s = d.centerlineSnapshot.parameters.find(
                (x: any) => x.id === a.parameterId,
              );
              await audits.addRow([
                r.id,
                r.created,
                r.user.name,
                d.title,
                d.equipmentSnapshot.name,
                d.centerlineSnapshot.setup,
                d.centerlineSnapshot.version,
                d.context,
                s.name,
                s.target,
                s.lower,
                s.upper,
                s.expected,
                s.unit,
                a.actual,
                a.value,
                a.withinLimits,
                a.comment,
                JSON.stringify(a.media),
              ]);
            }
          }
        },
        req.signal,
      );
    }
    const cursor = z
        .string()
        .uuid()
        .optional()
        .parse(p.get("cursor") || undefined),
      historyCursor = z
        .string()
        .uuid()
        .optional()
        .parse(p.get("historyCursor") || undefined);
    const [plans, records, people, active, total, followUps] =
      await Promise.all([
        db.centerline.findMany({
          where,
          orderBy: { id: "asc" },
          take: 101,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
        db.record.findMany({
          where: recordWhere,
          include: { user: { select: { name: true } } },
          orderBy: [{ created: "desc" }, { id: "desc" }],
          take: 101,
          ...(historyCursor ? { cursor: { id: historyCursor }, skip: 1 } : {}),
        }),
        visiblePeople(u, ids),
        db.centerline.count({ where: { ...where, active: true } }),
        db.record.count({ where: recordWhere }),
        db.record.count({
          where: {
            AND: [recordWhere, { data: { path: ["followUp"], equals: true } }],
          },
        }),
      ]);
    return Response.json({
      plans: plans.slice(0, 100),
      cursor: plans.length > 100 ? plans[99].id : null,
      records: records.slice(0, 100),
      historyCursor: records.length > 100 ? records[99].id : null,
      equipment,
      people,
      summary: { active, total, followUps },
      canManage:
        (await grants(u)).includes("manage") ||
        (await canAdminister(u, "centerlines.manage")),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser("centerlines"),
      b = await jsonBody(req, 1024 * 1024),
      entry = { at: new Date().toISOString(), by: u.id, name: u.name };
    if (b.action === "save" || b.action === "retire") {
      await requireDelegated("centerlines.manage", "manage");
      const id = z.string().uuid().optional().parse(b.id),
        version = z.number().int().positive().optional().parse(b.version);
      const v = b.action === "save" ? centerlineSchema.parse(b) : null;
      if (!id && !v) throw new HttpError(400, "Choose a centerline to retire");
      await db.$transaction(async (tx) => {
        if (id) {
          await tx.$queryRaw`SELECT id FROM "Centerline" WHERE id=${id} FOR UPDATE`;
          const old = await tx.centerline.findUnique({ where: { id } });
          if (!old || old.version !== version || !old.active)
            throw new HttpError(
              409,
              "Centerline changed or retired; refresh before saving",
            );
          await assertEquipmentAccess(u, old.equipmentId, tx);
          if (v && v.equipmentId !== old.equipmentId)
            throw new HttpError(
              400,
              "Create a separate centerline for another machine",
            );
          await tx.centerline.update({
            where: { id },
            data: {
              ...(v || { active: false }),
              version: { increment: 1 },
              updatedAt: new Date(),
              history: [
                ...(old.history as any[]),
                {
                  ...entry,
                  action: v ? "revised" : "retired",
                  version: old.version + 1,
                  ...(v ? { values: v } : {}),
                },
              ],
            },
          });
        } else if (v) {
          await assertEquipmentAccess(u, v.equipmentId, tx);
          await tx.centerline.create({
            data: {
              ...v,
              createdBy: u.id,
              history: [{ ...entry, action: "created", version: 1, values: v }],
            },
          });
        }
      });
    } else if (b.action === "audit") {
      const v = z
        .object({
          id: z.string().uuid(),
          version: z.number().int().positive(),
          submissionId: z.string().uuid(),
          context: z.string().trim().max(150),
          responses: responsesSchema,
        })
        .parse(b);
      await db.$transaction(async (tx) => {
        // Lock revisions against audits so each observation uses one approved snapshot.
        await tx.$queryRaw`SELECT id FROM "Centerline" WHERE id=${v.id} FOR SHARE`;
        const c = await tx.centerline.findUnique({ where: { id: v.id } });
        if (!c) throw new HttpError(404, "Centerline not found");
        const equipment = await assertEquipmentAccess(u, c.equipmentId, tx);
        // Serializes retries of this submission without blocking other auditors.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${v.submissionId},0))`;
        const prior = await tx.record.findUnique({
          where: { id: v.submissionId },
        });
        if (prior) {
          const d = prior.data as any;
          if (
            prior.kind !== "centerline" ||
            prior.userId !== u.id ||
            d.centerlineId !== c.id ||
            d.centerlineSnapshot.version !== v.version ||
            d.context !== v.context ||
            JSON.stringify(responsesSchema.parse(d.submittedResponses)) !==
              JSON.stringify(v.responses)
          )
            throw new HttpError(
              409,
              "Submission ID already used; start a new audit",
            );
          return;
        }
        if (!c.active || c.version !== v.version)
          throw new HttpError(
            409,
            "Centerline changed or retired; refresh and start a new audit",
          );
        const parameters = z
          .array(centerlineParameterSchema)
          .parse(c.parameters);
        if (
          v.responses.length !== parameters.length ||
          new Set(v.responses.map((r) => r.parameterId)).size !==
            parameters.length ||
          parameters.some(
            (s) => !v.responses.some((r) => r.parameterId === s.id),
          )
        )
          throw new HttpError(400, "Record every centerline setting once");
        const responses = v.responses.map((r) => {
          const s = parameters.find((s) => s.id === r.parameterId)!;
          let result;
          try {
            result = readingResult(s, r.actual);
          } catch (e) {
            throw new HttpError(400, (e as Error).message);
          }
          if (s.photo && !r.media.length)
            throw new HttpError(400, "Attach required photo/video evidence");
          if (!result.withinLimits && !r.comment)
            throw new HttpError(
              400,
              "Describe the abnormality or action taken for each out-of-limit setting",
            );
          return { ...r, ...result };
        });
        const media = responses.flatMap((r) => r.media);
        await ownEvidence(u.id, media, [], tx);
        const { history, ...snapshot } = c;
        await tx.record.create({
          data: {
            id: v.submissionId,
            kind: "centerline",
            userId: u.id,
            data: {
              centerlineId: c.id,
              title: c.title,
              equipmentId: c.equipmentId,
              equipmentSnapshot: equipment,
              centerlineSnapshot: JSON.parse(JSON.stringify(snapshot)),
              context: v.context,
              submittedResponses: v.responses,
              responses,
              media,
              followUp: responses.some((r) => !r.withinLimits),
              completed: new Date().toISOString(),
            },
          },
        });
      });
    } else throw new HttpError(400, "Unknown centerline action");
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
