import { z } from "zod";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import {
  requireUser,
  jsonBody,
  failure,
  HttpError,
  limit,
  digest,
  hashPassword,
} from "@/lib/security";
import { sendRecovery, resetDigest } from "@/lib/account-recovery";
const generic =
  "If an eligible account matches, a password email will be sent. Contact your administrator if it does not arrive.";
export async function GET() {
  try {
    const u = await requireUser("users");
    if (u.role !== "Admin") throw new HttpError(403, "Admin access required");
    return Response.json({
      requests: await db.registrationRequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      emailConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_FROM),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const b = await jsonBody(req);
    if (b.action === "register") {
      await limit("registration:global", 30, 3600);
      const v = z
        .object({
          username: z
            .string()
            .trim()
            .toLowerCase()
            .regex(/^[a-z0-9._-]{3,80}$/),
          name: z.string().trim().min(1).max(150),
          email: z
            .email()
            .max(254)
            .transform((s) => s.toLowerCase()),
          department: z.string().trim().min(1).max(150),
          reason: z.string().trim().max(1000),
        })
        .parse(b);
      await limit(`registration:${digest(v.username)}`, 3, 86400);
      await db.$transaction(async (tx) => {
        // Serialize the same requested username without exposing account existence.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"registration:" + v.username}))`;
        if (
          (await tx.user.findUnique({ where: { username: v.username } })) ||
          (await tx.registrationRequest.findFirst({
            where: { username: v.username, status: "Pending" },
          }))
        )
          return;
        const r = await tx.registrationRequest.create({ data: v });
        const admins = await tx.user.findMany({
          where: { role: "Admin", active: true },
          select: { id: true },
        });
        await tx.notification.createMany({
          data: admins.map((a) => ({
            userId: a.id,
            kind: "registration",
            sourceId: r.id,
            message: `Registration request: ${v.name} (${v.department}). Review in Accounts.`,
          })),
        });
      });
      return Response.json({
        ok: true,
        message:
          "Request received. An administrator must approve access and assign your departments before you can use the app.",
      });
    }
    if (b.action === "forgot") {
      await limit("recovery:global", 100, 3600);
      const identity = z
        .string()
        .trim()
        .min(1)
        .max(254)
        .parse(b.identity)
        .toLowerCase();
      await limit(`recovery:${digest(identity)}`, 3, 900);
      // Email must identify exactly one account; shared mailboxes cannot reset several accounts.
      const matches = await db.user.findMany({
        where: {
          active: true,
          OR: [
            { username: identity },
            { email: { equals: identity, mode: "insensitive" } },
          ],
        },
        take: 2,
      });
      if (matches.length === 1) await sendRecovery(matches[0].id);
      return Response.json({ ok: true, message: generic });
    }
    if (b.action === "reset") {
      await limit("reset:global", 100, 900);
      const v = z
          .object({
            token: z.string().regex(/^[a-f0-9]{64}$/),
            password: z.string().max(128),
          })
          .parse(b),
        password = await hashPassword(v.password),
        tokenHash = resetDigest(v.token);
      await db.$transaction(async (tx) => {
        const candidate = await tx.passwordReset.findUnique({
          where: { tokenHash },
        });
        if (!candidate)
          throw new HttpError(400, "Reset link is invalid or expired");
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${candidate.userId} FOR UPDATE`;
        await tx.$queryRaw`SELECT "tokenHash" FROM "PasswordReset" WHERE "tokenHash"=${tokenHash} FOR UPDATE`;
        const reset = await tx.passwordReset.findUnique({
          where: { tokenHash },
        });
        if (!reset || reset.expires < new Date())
          throw new HttpError(400, "Reset link is invalid or expired");
        const updated = await tx.user.updateMany({
          where: { id: reset.userId, version: reset.userVersion, active: true },
          data: { password, mustChange: false, version: { increment: 1 } },
        });
        if (!updated.count)
          throw new HttpError(400, "Reset link is invalid or expired");
        await tx.passwordReset.deleteMany({ where: { userId: reset.userId } });
        await tx.session.deleteMany({ where: { userId: reset.userId } });
      });
      return Response.json({
        ok: true,
        message: "Password saved. Sign in with your new password.",
      });
    }
    const u = await requireUser("users");
    if (u.role !== "Admin") throw new HttpError(403, "Admin access required");
    if (b.action === "resend") {
      const id = z.string().uuid().parse(b.userId);
      await limit(`invite:${id}`, 3, 900);
      return Response.json({ ok: true, emailSent: await sendRecovery(id) });
    }
    const v = z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["Approved", "Rejected"]),
      })
      .parse(b);
    const userId = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "RegistrationRequest" WHERE id=${v.id} FOR UPDATE`;
      const r = await tx.registrationRequest.findUnique({
        where: { id: v.id },
      });
      if (!r || r.status !== "Pending")
        throw new HttpError(409, "Request already reviewed");
      let userId: string | null = null;
      if (v.decision === "Approved") {
        if (await tx.user.findUnique({ where: { username: r.username } }))
          throw new HttpError(409, "Username is already in use");
        const account = await tx.user.create({
          data: {
            username: r.username,
            name: r.name,
            email: r.email,
            role: "Operator",
            password: await hashPassword(randomBytes(32).toString("hex")),
            workspaceAccess: {
              mode: "restricted",
              locations: [],
              equipmentIds: [],
            },
          },
        });
        userId = account.id;
      }
      await tx.registrationRequest.update({
        where: { id: r.id },
        data: {
          status: v.decision,
          reviewedBy: u.id,
          reviewedAt: new Date(),
          createdUserId: userId,
        },
      });
      return userId;
    });
    return Response.json({
      ok: true,
      userId,
      emailSent: userId ? await sendRecovery(userId) : false,
    });
  } catch (e) {
    return failure(e);
  }
}
