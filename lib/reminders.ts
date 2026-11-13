import { roleAuthority } from "./role-rules";
import { grants } from "./capabilities";
import { db } from "./db";
import { allowedDowntimeEquipment } from "./downtime-access-rules";
import { equipmentIds, type ScopedUser } from "./location-access";
import { localToday, type ShiftConfig } from "./operations-rules";
import { Prisma } from "@prisma/client";
export type OverdueEntity = {
  type: string;
  id: string;
  equipmentId: string;
  title: string;
  due: string;
  personal: string[];
};
export async function reminderConfig() {
  const s = await db.setting.findUnique({ where: { key: "overdue-channels" } });
  return {
    inApp: (s?.value as any)?.inApp !== false,
    email: (s?.value as any)?.email !== false,
  };
}
export async function overdueEntity(
  type: string,
  id: string,
  today: string,
): Promise<OverdueEntity | null> {
  if (type === "idea") {
    const r = await db.idea.findUnique({ where: { id } });
    return r && r.status !== "Completed" && r.dueDate < today
      ? {
          type,
          id,
          equipmentId: r.equipmentId,
          title: r.title,
          due: r.dueDate,
          personal: [r.pilotId, r.validatorId],
        }
      : null;
  }
  if (type === "problem") {
    const r = await db.problem.findUnique({ where: { id } });
    return r && r.status !== "Closed" && r.dueDate < today
      ? {
          type,
          id,
          equipmentId: r.equipmentId,
          title: r.reference + " · " + r.title,
          due: r.dueDate,
          personal: [r.ownerId, r.reviewerId],
        }
      : null;
  }
  if (type === "action") {
    const a = await db.problemAction.findUnique({
      where: { id },
      include: { problem: true },
    });
    return a &&
      a.problem.status !== "Closed" &&
      a.status !== "Completed" &&
      a.dueDate < today
      ? {
          type,
          id,
          equipmentId: a.problem.equipmentId,
          title: a.problem.reference + " · " + a.title,
          due: a.dueDate,
          personal: [a.ownerId, a.problem.ownerId, a.problem.reviewerId],
        }
      : null;
  }
  if (type === "pm") {
    const r = await db.maintenancePlan.findUnique({ where: { id } });
    return r && r.active && r.nextDue < today
      ? {
          type,
          id,
          equipmentId: r.equipmentId,
          title: r.kind === "cil" ? "CIL · " + r.title : r.title,
          due: r.nextDue,
          personal: [r.assigneeId],
        }
      : null;
  }
  return null;
}
export async function queueOverdueReminders(
  actor?: ScopedUser,
  personalOnly?: string,
  now = new Date(),
) {
  const setting = await db.setting.findUniqueOrThrow({
      where: { key: "shifts" },
    }),
    today = localToday((setting.value as ShiftConfig).timezone),
    config = await reminderConfig();
  const ids = actor ? await equipmentIds(actor) : null,
    scope = ids ? { equipmentId: { in: ids } } : {};
  const equipment = await db.equipment.findMany({
      where: ids ? { id: { in: ids } } : {},
    }),
    people = await db.user.findMany({ where: { active: true } });
  const policies = await db.policy.findMany();
  const capFor = (type: string) =>
    type === "idea" ? "ideas" : type === "pm" ? "maintenance" : "problems";
  const actorGrants = actor ? await grants(actor) : null;
  const candidates: { type: string; id: string }[] = [];
  // Fetch bounded pages for each source so no overdue rows are silently omitted.
  async function scan(
    type: string,
    fetch: (cursor?: string) => Promise<{ id: string }[]>,
  ) {
    let cursor: string | undefined;
    for (;;) {
      const rows = await fetch(cursor);
      candidates.push(...rows.map((r) => ({ type, id: r.id })));
      if (rows.length < 100) break;
      cursor = rows.at(-1)!.id;
    }
  }
  await scan("idea", (c) =>
    db.idea.findMany({
      where: { ...scope, status: { not: "Completed" }, dueDate: { lt: today } },
      select: { id: true },
      take: 100,
      orderBy: { id: "asc" },
      ...(c ? { cursor: { id: c }, skip: 1 } : {}),
    }),
  );
  await scan("problem", (c) =>
    db.problem.findMany({
      where: { ...scope, status: { not: "Closed" }, dueDate: { lt: today } },
      select: { id: true },
      take: 100,
      orderBy: { id: "asc" },
      ...(c ? { cursor: { id: c }, skip: 1 } : {}),
    }),
  );
  await scan("action", (c) =>
    db.problemAction.findMany({
      where: {
        problem: { ...scope, status: { not: "Closed" } },
        status: { not: "Completed" },
        dueDate: { lt: today },
      },
      select: { id: true },
      take: 100,
      orderBy: { id: "asc" },
      ...(c ? { cursor: { id: c }, skip: 1 } : {}),
    }),
  );
  await scan("pm", (c) =>
    db.maintenancePlan.findMany({
      where: { ...scope, active: true, nextDue: { lt: today } },
      select: { id: true },
      take: 100,
      orderBy: { id: "asc" },
      ...(c ? { cursor: { id: c }, skip: 1 } : {}),
    }),
  );
  const existing = new Set(
    (
      await db.reminder.findMany({
        where: {
          createdAt: { gte: new Date(+now - 48 * 3600000) },
          ...(ids ? { equipmentId: { in: ids } } : {}),
        },
        select: { dedupeKey: true },
      })
    ).map((r) => r.dedupeKey),
  );
  let queued = 0;
  for (const c of candidates) {
    if (actorGrants && !actorGrants.includes(capFor(c.type))) continue;
    const e = await overdueEntity(c.type, c.id, today);
    if (!e) continue;
    const eq = equipment.find((q) => q.id === e.equipmentId);
    if (!eq) continue;
    for (const p of people) {
      if (personalOnly && p.id !== personalOnly) continue;
      if (
        p.role !== "Admin" &&
        !roleAuthority(
          p,
          policies.find((q) => q.role === (p.customRole || p.role)),
        ).grants.includes(capFor(e.type))
      )
        continue;
      if (!allowedDowntimeEquipment(p.role, p.workspaceAccess, eq)) continue;
      if (!e.personal.includes(p.id) && p.role !== "Manager") continue;
      const inApp = config.inApp && p.overdueInApp,
        email = config.email && p.overdueEmail;
      if (!inApp && !email) continue;
      const dedupeKey = [e.type, e.id, e.due, today, p.id].join(":"),
        message = `Overdue ${e.type}: ${e.title}. Due ${e.due}. ${[eq.plant, eq.department, eq.area, eq.name].join(" / ")}. Open the relevant section to review and update the work.`;
      if (existing.has(dedupeKey)) continue;
      try {
        await db.$transaction(async (tx) => {
          const r = await tx.reminder.create({
            data: {
              dedupeKey,
              entityType: e.type,
              entityId: e.id,
              equipmentId: e.equipmentId,
              userId: p.id,
              subject: `Overdue ${e.type}: ${e.title}`.slice(0, 250),
              message,
              email,
              status: email ? "Pending" : "In-app only",
            },
          });
          if (inApp)
            await tx.notification.create({
              data: {
                userId: p.id,
                kind: "overdue",
                sourceId: r.id,
                ideaId: e.type === "idea" ? e.id : null,
                message,
              },
            });
        });
        queued++;
        existing.add(dedupeKey);
      } catch (error) {
        if (!(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2002"
        ))
          throw error;
      }
    }
  }
  return { queued, today };
}
export async function deliverReminderEmails(
  transport: Pick<import("nodemailer").Transporter, "sendMail">,
) {
  const config = await reminderConfig(),
    setting = await db.setting.findUniqueOrThrow({ where: { key: "shifts" } }),
    today = localToday((setting.value as ShiftConfig).timezone),
    now = new Date();
  let sent = 0;
  const rows = await db.reminder.findMany({
    where: {
      email: true,
      status: "Pending",
      nextAttemptAt: { lte: now },
      OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: 20,
  });
  for (const r of rows) {
    const claim = await db.reminder.updateMany({
      where: {
        id: r.id,
        status: "Pending",
        OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }],
      },
      data: {
        claimedUntil: new Date(+now + 120000),
        attempts: { increment: 1 },
      },
    });
    if (!claim.count) continue;
    const [p, e, eq] = await Promise.all([
      db.user.findUnique({ where: { id: r.userId } }),
      overdueEntity(r.entityType, r.entityId, today),
      db.equipment.findUnique({ where: { id: r.equipmentId } }),
    ]);
    const permission = p ? await grants(p) : [];
    if (
      !permission.includes(
        r.entityType === "idea"
          ? "ideas"
          : r.entityType === "pm"
            ? "maintenance"
            : "problems",
      ) ||
      !config.email ||
      !p?.active ||
      !p.overdueEmail ||
      !e ||
      !eq ||
      e.due !== r.dedupeKey.split(":")[2] ||
      !allowedDowntimeEquipment(p.role, p.workspaceAccess, eq) ||
      (!e.personal.includes(p.id) && p.role !== "Manager")
    ) {
      await db.reminder.update({
        where: { id: r.id },
        data: {
          status: "Cancelled",
          claimedUntil: null,
          lastError:
            "Work completed, reassigned, or notification access changed",
        },
      });
      continue;
    }
    try {
      if (!p.email) throw Error("No email address");
      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: p.email,
        subject: r.subject,
        text: r.message,
        messageId: `<floorwork-reminder-${r.id}@notifications.local>`,
      });
      await db.reminder.update({
        where: { id: r.id },
        data: {
          status: "Sent",
          sentAt: new Date(),
          claimedUntil: null,
          lastError: null,
        },
      });
      sent++;
    } catch {
      await db.reminder.update({
        where: { id: r.id },
        data: {
          status: r.attempts + 1 >= 10 ? "Failed" : "Pending",
          nextAttemptAt: new Date(
            Date.now() +
              Math.min(3600000, 60000 * 2 ** Math.min(r.attempts + 1, 6)),
          ),
          claimedUntil: null,
          lastError: p.email
            ? "SMTP delivery failed; check the approved relay"
            : "Recipient email is missing",
        },
      });
    }
  }
  return { sent };
}
