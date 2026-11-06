import nodemailer from "nodemailer";
import { db } from "./db";
export function smtpReady() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
}
export async function deliverShiftEmails(
  transportOverride?: Pick<
    import("nodemailer").Transporter,
    "sendMail" | "close"
  >,
) {
  if (!smtpReady()) return { sent: 0, configured: false };
  const transport =
    transportOverride ??
    nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      requireTLS: process.env.SMTP_SECURE !== "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
      tls: { rejectUnauthorized: true },
      connectionTimeout: 10000,
      socketTimeout: 15000,
    });
  const now = new Date();
  let sent = 0;
  const rows = await db.emailDelivery.findMany({
    where: {
      status: "Pending",
      nextAttemptAt: { lte: now },
      OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: 20,
  });
  for (const row of rows) {
    const claimed = await db.emailDelivery.updateMany({
      where: {
        id: row.id,
        status: "Pending",
        OR: [{ claimedUntil: null }, { claimedUntil: { lt: now } }],
      },
      data: {
        claimedUntil: new Date(+now + 120000),
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) continue;
    const [schedule, user] = await Promise.all([
      db.workSchedule.findUnique({ where: { id: row.scheduleId } }),
      db.user.findUnique({ where: { id: row.userId } }),
    ]);
    if (
      !schedule?.active ||
      !schedule.notifyEmail ||
      !user?.active ||
      !["Admin", "Manager", "DL/TL"].includes(user.role)
    ) {
      await db.emailDelivery.update({
        where: { id: row.id },
        data: {
          status: "Cancelled",
          claimedUntil: null,
          lastError: "Email channel or recipient disabled",
        },
      });
      continue;
    }
    try {
      if (!user.email) throw Error("Recipient email is missing");
      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: user.email,
        subject: row.subject,
        text: row.message,
        messageId: `<floorwork-${row.id}@notifications.local>`,
      });
      await db.emailDelivery.update({
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
      await db.emailDelivery.update({
        where: { id: row.id },
        data: {
          status: attempts >= 10 ? "Failed" : "Pending",
          nextAttemptAt: new Date(
            Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(attempts, 6)),
          ),
          claimedUntil: null,
          lastError: user.email
            ? "SMTP delivery failed; check server settings and retry"
            : "Recipient email is missing",
        },
      });
    }
  }
  transport.close();
  return { sent, configured: true };
}
