import { randomBytes, createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { db } from "./db";
import { configuredOrigin } from "./request-policy";
export const resetDigest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export async function sendRecovery(
  userId: string,
  transportOverride?: Pick<
    import("nodemailer").Transporter,
    "sendMail" | "close"
  >,
) {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (
    !u?.active ||
    !u.email ||
    !process.env.SMTP_HOST ||
    !process.env.SMTP_FROM
  )
    return false;
  const origin = configuredOrigin(process.env.APP_ORIGIN),
    token = randomBytes(32).toString("hex"),
    tokenHash = resetDigest(token);
  // Hash-only storage: no recovery link or plaintext password is stored in the DB/logs.
  await db.passwordReset.create({
    data: {
      tokenHash,
      userId: u.id,
      userVersion: u.version,
      expires: new Date(Date.now() + 30 * 60000),
    },
  });
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
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: u.email,
      subject: "Set your Floorwork password",
      text: `A password setup/reset was requested for your Floorwork account (${u.username}).\n\n${origin.origin}/#reset=${token}\n\nThis single-use link expires in 30 minutes. If you did not request it, ignore this message.`,
    });
    return true;
  } catch {
    await db.passwordReset.deleteMany({ where: { tokenHash } });
    return false;
  } finally {
    if (!transportOverride) transport.close();
  }
}
