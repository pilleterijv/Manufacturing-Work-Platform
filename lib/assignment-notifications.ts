import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { grants } from "./capabilities";
import { allowedDowntimeEquipment } from "./downtime-access-rules";
type Assignment = {
  type: string;
  id: string;
  equipmentId: string;
  assignees: string[];
  previous?: string[];
  revision: string | number;
};
export async function queueAssignments(tx: Prisma.TransactionClient, a: Assignment) {
  for (const userId of new Set(a.assignees.filter(Boolean))) {
    if (a.previous?.includes(userId)) continue;
    const id = createHash("sha256")
      .update(JSON.stringify([a.type, a.id, a.revision, userId]))
      .digest("hex");
    await tx.assignmentDelivery.updateMany({
      where: {
        entityType: a.type,
        entityId: a.id,
        userId,
        id: { not: id },
        status: { in: ["Pending", "Failed"] },
      },
      data: {
        status: "Cancelled",
        claimedUntil: null,
        lastError: "Superseded by a new assignment",
      },
    });
    const created = await tx.assignmentDelivery.createMany({
      data: [
        {
          id,
          userId,
          entityType: a.type,
          entityId: a.id,
          equipmentId: a.equipmentId,
        },
      ],
      skipDuplicates: true,
    });
    if (created.count)
      await tx.notification.create({
        data: {
          userId,
          kind: "assignment",
          sourceId: id,
          message: "New work assigned to you. Open My assignments or the work queue to review it.",
        },
      });
  }
}
// Re-resolve live assignment, scope, account email and permission at delivery time.
export async function currentAssignment(type: string, id: string) {
  if (type === "idea") {
    const r = await db.idea.findUnique({ where: { id } });
    return r && r.status !== "Completed"
      ? {
          equipmentId: r.equipmentId,
          title: r.title,
          due: r.dueDate,
          people: [r.pilotId, r.validatorId],
          cap: "ideas",
          tab: "Improvement ideas",
        }
      : null;
  }
  if (type === "defect") {
    const r = await db.defect.findUnique({ where: { id } });
    return r && r.status === "Open"
      ? {
          equipmentId: r.equipmentId,
          title: r.title,
          due: "Review the defect",
          people: r.assigneeId ? [r.assigneeId] : [],
          cap: "defects",
          tab: "Defect reporting",
        }
      : null;
  }
  if (type === "schedule") {
    const r = await db.workSchedule.findUnique({ where: { id } });
    return r?.active
      ? {
          equipmentId: r.equipmentId,
          title: r.title,
          due: "See your shift work queue",
          people: r.assigneeIds as string[],
          cap: r.kind === "audit" ? "audits" : "work",
          tab: "Work queue",
        }
      : null;
  }
  if (type === "action") {
    const a = await db.problemAction.findUnique({
      where: { id },
      include: { problem: true },
    });
    return a && a.status !== "Completed" && a.problem.status !== "Closed"
      ? {
          equipmentId: a.problem.equipmentId,
          title: a.title,
          due: a.dueDate,
          people: [a.ownerId],
          cap: "problems",
          tab: "Problem solving",
        }
      : null;
  }
  if (type === "problem") {
    const r = await db.problem.findUnique({ where: { id } });
    return r && r.status !== "Closed"
      ? {
          equipmentId: r.equipmentId,
          title: r.title,
          due: r.dueDate,
          people: [r.ownerId, r.reviewerId],
          cap: "problems",
          tab: "Problem solving",
        }
      : null;
  }
  if (type === "maintenance") {
    const r = await db.maintenancePlan.findUnique({ where: { id } });
    return r?.active
      ? {
          equipmentId: r.equipmentId,
          title: r.title,
          due: r.nextDue,
          people: [r.assigneeId],
          cap: "maintenance",
          tab: r.kind === "cil" ? "TPM / CIL" : "Preventive maintenance",
        }
      : null;
  }
  if (type === "standard") {
    const original = await db.standard.findUnique({ where: { id } });
    const r = original
      ? await db.standard.findFirst({
          where: { family: original.family },
          orderBy: { revision: "desc" },
        })
      : null;
    return r && !r.archived
      ? {
          equipmentId: r.equipmentId,
          title: r.title,
          due: "See your shift work queue",
          people: r.assigneeIds as string[],
          cap: r.kind === "audit" ? "audits" : "work",
          tab:
            r.workflow === "leader"
              ? "DL/TL Standard Work"
              : r.workflow === "changeover"
                ? "Changeover standards"
                : r.kind === "audit"
                  ? "Standard work audits"
                  : "Standard work",
        }
      : null;
  }
  return null;
}
export async function deliverAssignmentEmails(transport: Pick<import("nodemailer").Transporter, "sendMail">) {
  const rows = await db.assignmentDelivery.findMany({
    where: {
      status: "Pending",
      nextAttemptAt: { lte: new Date() },
      OR: [{ claimedUntil: null }, { claimedUntil: { lt: new Date() } }],
    },
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    take: 20,
  });
  let sent = 0;
  for (const row of rows) {
    const claimed = await db.assignmentDelivery.updateMany({
      where: {
        id: row.id,
        status: "Pending",
        OR: [{ claimedUntil: null }, { claimedUntil: { lt: new Date() } }],
      },
      data: {
        claimedUntil: new Date(Date.now() + 120000),
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) continue;
    try {
      const [task, user, eq] = await Promise.all([
        currentAssignment(row.entityType, row.entityId),
        db.user.findUnique({ where: { id: row.userId } }),
        db.equipment.findUnique({ where: { id: row.equipmentId } }),
      ]);
      if (
        !task ||
        !user?.active ||
        !eq ||
        task.equipmentId !== eq.id ||
        !task.people.includes(user.id) ||
        !allowedDowntimeEquipment(user.role, user.workspaceAccess, eq) ||
        !(await grants(user)).includes(task.cap as any)
      ) {
        await db.assignmentDelivery.update({
          where: { id: row.id },
          data: {
            status: "Cancelled",
            claimedUntil: null,
            lastError: "Assignment, account or access is no longer active",
          },
        });
        continue;
      }
      if (!user.email) throw Error("Missing email");
      const origin = new URL(process.env.APP_ORIGIN!);
      const message = `Hello ${user.name},\n\nWork has been assigned to you: ${task.title}\nSection: ${task.tab}\nLocation: ${[eq.plant, eq.department, eq.area, eq.name].filter(Boolean).join(" / ")}\nDue: ${task.due}\n\nSign in at ${origin.origin} and open ${task.tab} or your work queue.\nRecord reference: ${row.entityId}`;
      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: user.email,
        subject: "Work Platform: new assignment",
        text: message,
        messageId: `<assignment-${row.id}@notifications.local>`,
      });
      await db.assignmentDelivery.update({
        where: { id: row.id },
        data: {
          status: "Sent",
          sentAt: new Date(),
          claimedUntil: null,
          lastError: null,
        },
      });
      sent++;
    } catch {
      const attempts = row.attempts + 1;
      await db.assignmentDelivery.update({
        where: { id: row.id },
        data: {
          status: attempts >= 10 ? "Failed" : "Pending",
          claimedUntil: null,
          nextAttemptAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(attempts, 6))),
          lastError: "Assignment email not confirmed. Check the account email and mail service.",
        },
      });
    }
  }
  return { sent };
}
