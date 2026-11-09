import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireUser,
  grants,
  jsonBody,
  HttpError,
  failure,
} from "@/lib/security";
import {
  equipmentIds,
  assertEquipmentAccess,
  eligiblePeople,
  visiblePeople,
  recordScope,
} from "@/lib/location-access";
import { readFilters, recordFilters } from "@/lib/filters";
import {
  maintenanceSchema,
  nextMaintenanceDate,
} from "@/lib/maintenance-rules";
import { evidenceSchema, ownEvidence } from "@/lib/evidence";
import { localToday, type ShiftConfig } from "@/lib/operations-rules";
import { streamWorkbook, paged } from "@/lib/excel-stream";
export async function GET(req: Request) {
  try {
    const u = await requireUser("maintenance"),
      ids = await equipmentIds(u),
      { person, search } = readFilters(req.url),
      params = new URL(req.url).searchParams;
    const eq = await db.equipment.findMany({
      where: { id: { in: ids } },
      orderBy: { name: "asc" },
    });
    const where = {
      equipmentId: { in: ids },
      ...(person ? { assigneeId: person } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" as const } },
              {
                equipmentId: {
                  in: eq
                    .filter((e) =>
                      [e.name, e.department, e.area]
                        .join(" ")
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((e) => e.id),
                },
              },
            ],
          }
        : {}),
    };
    if (params.get("format") === "xlsx") {
      await requireUser("export");
      return await streamWorkbook(
        "floorwork-maintenance.xlsx",
        async (book) => {
          const sheet = book.addWorksheet("PM plans"),
            history = book.addWorksheet("PM completions");
          await sheet.addRow([
            "ID",
            "Task",
            "Equipment ID",
            "Assignee ID",
            "Next due",
            "Interval days",
            "Active",
          ]);
          for await (const p of paged((cursor) =>
            db.maintenancePlan.findMany({
              where,
              orderBy: { id: "asc" },
              take: 100,
              ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            }),
          ))
            await sheet.addRow([
              p.id,
              p.title,
              p.equipmentId,
              p.assigneeId,
              p.nextDue,
              p.intervalDays,
              p.active,
            ]);
          await history.addRow([
            "Record ID",
            "Task",
            "Recorder",
            "Completed UTC",
            "Scheduled due",
            "Evidence JSON",
          ]);
          for await (const r of paged((cursor) =>
            db.record.findMany({
              where: {
                kind: "pm",
                AND: [recordScope(ids), recordFilters(person, search)],
              },
              include: { user: { select: { name: true } } },
              take: 100,
              orderBy: { id: "asc" },
              ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            }),
          ))
            await history.addRow([
              r.id,
              (r.data as any).title,
              r.user.name,
              r.created,
              (r.data as any).scheduledDue,
              JSON.stringify((r.data as any).responses),
            ]);
        },
        req.signal,
      );
    }
    const cursor = z
      .string()
      .uuid()
      .optional()
      .parse(params.get("cursor") || undefined);
    const [plans, records, people, setting] = await Promise.all([
      db.maintenancePlan.findMany({
        where,
        orderBy: { id: "asc" },
        take: 101,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      db.record.findMany({
        where: {
          kind: "pm",
          AND: [recordScope(ids), recordFilters(person, search)],
        },
        include: { user: { select: { name: true } } },
        orderBy: [{ created: "desc" }, { id: "desc" }],
        take: 100,
      }),
      visiblePeople(u, ids),
      db.setting.findUniqueOrThrow({ where: { key: "shifts" } }),
    ]);
    return Response.json({
      plans: plans.slice(0, 100),
      hasMore: plans.length > 100,
      cursor: plans[99]?.id ?? null,
      records,
      people,
      equipment: eq,
      today: localToday((setting.value as ShiftConfig).timezone),
      canManage: (await grants(u)).includes("manage"),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser("maintenance"),
      b = await jsonBody(req),
      entry = { at: new Date().toISOString(), by: u.id, name: u.name };
    if (b.action === "save") {
      await requireUser("manage");
      const v = maintenanceSchema.parse(b),
        id = z.string().uuid().optional().parse(b.id),
        version = z.number().int().positive().optional().parse(b.version);
      await db.$transaction(async (tx) => {
        if (id) {
          await tx.$queryRaw`SELECT id FROM "MaintenancePlan" WHERE id=${id} FOR UPDATE`;
          const old = await tx.maintenancePlan.findUnique({ where: { id } });
          if (!old || old.version !== version)
            throw new HttpError(409, "PM changed; reload before saving");
          await assertEquipmentAccess(u, old.equipmentId, tx);
          await assertEquipmentAccess(u, v.equipmentId, tx);
          await eligiblePeople(v.equipmentId, [v.assigneeId], tx);
          await tx.maintenancePlan.update({
            where: { id },
            data: {
              ...v,
              version: { increment: 1 },
              history: [
                ...(old.history as any[]),
                { ...entry, event: "Plan updated", values: v },
              ],
            },
          });
        } else {
          await assertEquipmentAccess(u, v.equipmentId, tx);
          await eligiblePeople(v.equipmentId, [v.assigneeId], tx);
          await tx.maintenancePlan.create({
            data: {
              ...v,
              createdBy: u.id,
              history: [{ ...entry, event: "Plan created", values: v }],
            },
          });
        }
      });
    } else if (b.action === "complete") {
      const v = z
        .object({
          id: z.string().uuid(),
          version: z.number().int().positive(),
          responses: z
            .array(
              z.object({
                stepId: z.string(),
                answer: z.boolean(),
                comment: z.string().max(1000),
                media: evidenceSchema,
              }),
            )
            .max(100),
        })
        .parse(b);
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "MaintenancePlan" WHERE id=${v.id} FOR UPDATE`;
        const p = await tx.maintenancePlan.findUnique({ where: { id: v.id } });
        if (!p || !p.active || p.version !== v.version)
          throw new HttpError(409, "PM changed or already completed; reload");
        const equipment = await assertEquipmentAccess(u, p.equipmentId, tx);
        if (u.role !== "Admin" && p.assigneeId !== u.id)
          throw new HttpError(
            403,
            "Only the assigned person or Admin can complete this PM",
          );
        const steps = p.steps as { id: string; photo: boolean }[];
        if (
          v.responses.length !== steps.length ||
          new Set(v.responses.map((r) => r.stepId)).size !== steps.length ||
          steps.some(
            (s) =>
              !v.responses.some(
                (r) => r.stepId === s.id && (!s.photo || r.media.length),
              ),
          )
        )
          throw new HttpError(
            400,
            "Complete every PM step and required photo/video evidence",
          );
        const media = v.responses.flatMap((r) => r.media);
        await ownEvidence(u.id, media);
        const setting = await tx.setting.findUniqueOrThrow({
            where: { key: "shifts" },
          }),
          today = localToday((setting.value as ShiftConfig).timezone),
          nextDue = nextMaintenanceDate(p.nextDue, today, p.intervalDays);
        if (p.nextDue > today)
          throw new HttpError(
            409,
            "This PM is not due yet. A manager can reschedule it for early service",
          );
        const record = await tx.record.create({
          data: {
            kind: "pm",
            userId: u.id,
            data: {
              planId: p.id,
              title: p.title,
              equipmentId: p.equipmentId,
              equipmentSnapshot: equipment,
              planSnapshot: JSON.parse(JSON.stringify(p)),
              scheduledDue: p.nextDue,
              completed: new Date().toISOString(),
              responses: v.responses,
              media,
              followUp: v.responses.some((r) => !r.answer),
            },
          },
        });
        await tx.maintenancePlan.update({
          where: { id: p.id },
          data: {
            nextDue,
            version: { increment: 1 },
            history: [
              ...(p.history as any[]),
              {
                ...entry,
                event: "Completed",
                recordId: record.id,
                scheduledDue: p.nextDue,
                nextDue,
              },
            ],
          },
        });
      });
    } else throw new HttpError(400, "Unknown PM action");
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
