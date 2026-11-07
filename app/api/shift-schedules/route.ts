import {
  equipmentIds,
  assertEquipmentAccess,
  eligiblePeople,
  visiblePeople,
} from "@/lib/location-access";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, jsonBody, failure, HttpError } from "@/lib/security";
import { workScheduleSchema } from "@/lib/shift-schedule-rules";
import { shiftConfigSchema } from "@/lib/operations-rules";
import { smtpReady } from "@/lib/email-delivery";
export async function GET() {
  try {
    const u = await requireUser("manage");
    const ids = await equipmentIds(u);
    const [schedules, people, standards, setting, health, pending, failed] =
      await Promise.all([
        db.workSchedule.findMany({
          where: { equipmentId: { in: ids } },
          orderBy: { id: "asc" },
          take: 1000,
        }),
        visiblePeople(u, ids),
        db.$queryRaw<
          any[]
        >`SELECT DISTINCT ON (s.family) s.*,e.name AS "equipmentName",e.department FROM "Standard" s JOIN "Equipment" e ON e.id=s."equipmentId" WHERE e.id=ANY(${ids}::text[]) ORDER BY s.family,s.revision DESC`,
        db.setting.findUniqueOrThrow({ where: { key: "shifts" } }),
        db.setting.findUnique({ where: { key: "shift-monitor-health" } }),
        u.role === "Admin"
          ? db.emailDelivery.count({ where: { status: "Pending" } })
          : Promise.resolve(null),
        u.role === "Admin"
          ? db.emailDelivery.count({ where: { status: "Failed" } })
          : Promise.resolve(null),
      ]);
    return Response.json({
      schedules,
      people: people.map(({ id, name, role, hasEmail }) => ({
        id,
        name,
        role,
        hasEmail,
      })),
      standards,
      config: setting.value,
      health: health?.value ?? null,
      email: { configured: smtpReady(), pending, failed },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser("manage"),
      b = await jsonBody(req);
    if (b.action === "create") {
      const v = workScheduleSchema.parse(b),
        setting = await db.setting.findUniqueOrThrow({
          where: { key: "shifts" },
        }),
        config = shiftConfigSchema.parse(setting.value);
      const latest = await db.standard.findFirst({
        where: { family: v.family },
        orderBy: { revision: "desc" },
      });
      if (!latest) throw new HttpError(400, "Choose a current standard");
      await assertEquipmentAccess(u, latest.equipmentId);
      await eligiblePeople(latest.equipmentId, [
        ...v.assigneeIds,
        ...v.managerIds,
      ]);
      if (
        latest.kind === "audit" &&
        (latest.assigneeIds as string[]).length &&
        v.assigneeIds.some(
          (id) => !(latest.assigneeIds as string[]).includes(id),
        )
      )
        throw new HttpError(400, "Choose people assigned to this DL/TL task");
      if (
        v.shiftNames.some((name) => !config.shifts.some((s) => s.name === name))
      )
        throw new HttpError(400, "Choose valid shifts");
      const ids = [...new Set(v.managerIds)],
        managers = await db.user.findMany({
          where: {
            id: { in: ids },
            active: true,
            role: { in: ["Admin", "Manager", "DL/TL"] },
          },
        });
      if (managers.length !== ids.length)
        throw new HttpError(
          400,
          "Choose active manager or supervisor recipients",
        );
      if (v.notifyEmail && managers.some((m) => !m.email))
        throw new HttpError(
          400,
          "Add an email address to each recipient account before enabling email",
        );
      const assignees = [...new Set(v.assigneeIds)];
      if (
        (await db.user.count({
          where: { id: { in: assignees }, active: true },
        })) !== assignees.length
      )
        throw new HttpError(400, "Choose active assignees");
      const now = new Date();
      await db.workSchedule.create({
        data: {
          ...v,
          kind: latest.kind,
          assigneeIds: assignees,
          managerIds: ids,
          equipmentId: latest.equipmentId,
          title: latest.title,
          config,
          createdBy: u.id,
          effectiveFrom: now,
          checkedThrough: now,
        },
      });
    } else if (b.action === "update") {
      const v = z
        .object({
          id: z.string().uuid(),
          version: z.number().int().positive(),
          active: z.boolean(),
          notifyInApp: z.boolean(),
          notifyEmail: z.boolean(),
        })
        .parse(b);
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "WorkSchedule" WHERE id=${v.id} FOR UPDATE`;
        const old = await tx.workSchedule.findUnique({ where: { id: v.id } });
        if (!old || old.version !== v.version)
          throw new HttpError(409, "Schedule changed; refresh before saving");
        await assertEquipmentAccess(u, old.equipmentId, tx);
        if (v.notifyEmail) {
          const managers = await tx.user.findMany({
            where: { id: { in: old.managerIds as string[] }, active: true },
          });
          if (managers.some((m) => !m.email))
            throw new HttpError(400, "Recipients need email addresses");
        }
        await tx.workSchedule.update({
          where: { id: v.id },
          data: {
            active: v.active,
            notifyInApp: v.notifyInApp,
            notifyEmail: v.notifyEmail,
            version: { increment: 1 },
            ...(!old.active && v.active
              ? { effectiveFrom: new Date(), checkedThrough: new Date() }
              : {}),
          },
        });
        if (!v.notifyEmail || !v.active)
          await tx.emailDelivery.updateMany({
            where: { scheduleId: v.id, status: { in: ["Pending", "Failed"] } },
            data: {
              status: "Cancelled",
              lastError: "Schedule or email channel disabled",
            },
          });
      });
    } else if (b.action === "retryFailedEmails") {
      const permittedIds = await equipmentIds(u);
      const enabled = await db.workSchedule.findMany({
        where: {
          active: true,
          notifyEmail: true,
          equipmentId: { in: permittedIds },
        },
        select: { id: true },
      });
      await db.emailDelivery.updateMany({
        where: {
          status: "Failed",
          scheduleId: { in: enabled.map((s) => s.id) },
        },
        data: {
          status: "Pending",
          attempts: 0,
          nextAttemptAt: new Date(),
          claimedUntil: null,
          lastError: null,
        },
      });
    } else throw new HttpError(400, "Unknown schedule action");
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
