import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  requireUser,
  grants,
  jsonBody,
  HttpError,
  failure,
  hashPassword,
} from "@/lib/security";
import {
  capabilities,
  roles,
  standardSchema,
  cyclesSchema,
  videoUrl,
} from "@/lib/rules";
export async function GET() {
  try {
    const u = await requireUser();
    const g = await grants(u);
    const [equipment, standards, records, content, users, policies] =
      await Promise.all([
        db.equipment.findMany({ orderBy: { name: "asc" } }),
        db.standard.findMany({
          orderBy: [{ title: "asc" }, { revision: "desc" }],
        }),
        db.record.findMany({
          where: g.includes("analytics") ? {} : { userId: u.id },
          orderBy: { created: "desc" },
          take: 2000,
          include: { user: { select: { name: true } } },
        }),
        db.content.findMany({ where: { active: true } }),
        g.includes("users")
          ? db.user.findMany({
              select: {
                id: true,
                username: true,
                name: true,
                role: true,
                active: true,
                mustChange: true,
              },
            })
          : [],
        g.includes("permissions") ? db.policy.findMany() : [],
      ]);
    return Response.json({
      equipment,
      standards,
      records: records.filter((r) =>
        r.kind === "run"
          ? g.includes("work") || g.includes("analytics")
          : r.kind === "audit"
            ? g.includes("audits")
            : g.includes("studies") || g.includes("analytics"),
      ),
      content,
      users,
      policies,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const b = await jsonBody(req);
    const action = z.string().parse(b.action);
    const cap = (
      {
        standard: "manage",
        equipment: "manage",
        guide: "manage",
        video: "training",
        archive: "training",
        run: "work",
        study: "studies",
        audit: "audits",
        user: "users",
        policy: "permissions",
      } as const
    )[action as "standard"];
    if (!cap) throw new HttpError(400, "Unknown action");
    const u = await requireUser(cap);
    if (action === "equipment") {
      const v = z
        .object({
          name: z.string().min(1).max(150),
          plant: z.string().max(100),
          department: z.string().max(100),
          area: z.string().max(100),
          line: z.string().max(100),
        })
        .parse(b);
      await db.equipment.create({ data: v });
    }
    if (action === "standard") {
      const v = standardSchema.parse(b);
      if (!(await db.equipment.findUnique({ where: { id: v.equipmentId } })))
        throw new HttpError(400, "Select equipment");
      const family = v.family ?? crypto.randomUUID();
      await db.$transaction(
        async (tx) => {
          const last = await tx.standard.findFirst({
            where: { family },
            orderBy: { revision: "desc" },
          });
          await tx.standard.create({
            data: {
              ...v,
              family,
              revision: (last?.revision ?? 0) + 1,
              steps: v.steps,
            },
          });
        },
        { isolationLevel: "Serializable" },
      );
    }
    if (action === "guide" || action === "video") {
      const v = z
        .object({
          title: z.string().min(1).max(150),
          equipmentId: z.string().optional(),
          body: z.string().min(1).max(10000),
        })
        .parse(b);
      if (
        v.equipmentId &&
        !(await db.equipment.findUnique({ where: { id: v.equipmentId } }))
      )
        throw new HttpError(400, "Unknown equipment");
      if (action === "video") {
        try {
          v.body = videoUrl(v.body);
        } catch {
          throw new HttpError(400, "Use an HTTPS YouTube or Vimeo video link");
        }
      }
      await db.content.create({
        data: { ...v, equipmentId: v.equipmentId || null, kind: action },
      });
    }
    if (action === "archive") {
      const id = z.string().parse(b.id);
      const item = await db.content.findUnique({ where: { id } });
      if (!item) throw new HttpError(404, "Not found");
      if (item.kind === "guide") await requireUser("manage");
      await db.content.update({ where: { id }, data: { active: false } });
    }
    if (action === "run" || action === "audit") {
      const v = z
        .object({
          standardId: z.string(),
          started: z.iso.datetime(),
          operator: z.string().max(150).optional(),
          responses: z
            .array(
              z.object({
                stepId: z.string(),
                answer: z.boolean(),
                photo: z.string().nullable(),
                comment: z.string().max(1000),
                at: z.iso.datetime().optional(),
              }),
            )
            .max(100),
          cycles: cyclesSchema.optional(),
        })
        .parse(b);
      const standard = await db.standard.findUnique({
        where: { id: v.standardId },
      });
      if (!standard) throw new HttpError(404, "Standard not found");
      const steps = standard.steps as {
        id: string;
        text: string;
        photo: boolean;
      }[];
      if (
        v.responses.length !== steps.length ||
        new Set(v.responses.map((x) => x.stepId)).size !== steps.length ||
        steps.some(
          (s) =>
            !v.responses.some(
              (r) => r.stepId === s.id && (!s.photo || r.photo),
            ),
        )
      )
        throw new HttpError(400, "Complete every step and required photo");
      for (const r of v.responses)
        if (
          r.photo &&
          !(await db.photo.findFirst({ where: { id: r.photo, userId: u.id } }))
        )
          throw new HttpError(403, "Photo must belong to you");
      if (
        new Date(v.started) > new Date() ||
        Date.now() - +new Date(v.started) > 86400000
      )
        throw new HttpError(400, "Invalid start time");
      if (action === "audit" && (!v.operator?.trim() || !v.cycles?.length))
        throw new HttpError(
          400,
          "Audits require an operator and at least one timed cycle",
        );
      const data = {
        ...v,
        responses: v.responses.map((r) => ({
          ...r,
          at: r.at ?? new Date().toISOString(),
        })),
        snapshot: standard,
        completed: new Date().toISOString(),
        durationSeconds: (Date.now() - +new Date(v.started)) / 1000,
        followUp:
          v.responses.some((r) => !r.answer) ||
          (v.cycles ?? []).some(
            (c) => c.seconds > standard.target * (1 + standard.tolerance / 100),
          ),
      };
      await db.record.create({
        data: {
          kind: action,
          userId: u.id,
          standardId: standard.id,
          data: JSON.parse(JSON.stringify(data)),
        },
      });
    }
    if (action === "study") {
      const v = z
        .object({
          title: z.string().min(1).max(150),
          equipmentId: z.string(),
          cycles: cyclesSchema,
        })
        .parse(b);
      if (!(await db.equipment.findUnique({ where: { id: v.equipmentId } })))
        throw new HttpError(400, "Select equipment");
      await db.record.create({
        data: { kind: "study", userId: u.id, data: v },
      });
    }
    if (action === "policy") {
      const v = z
        .object({ role: z.enum(roles), grants: z.array(z.enum(capabilities)) })
        .parse(b);
      if (v.role === "Admin")
        throw new HttpError(400, "Admin permissions are protected");
      await db.policy.upsert({
        where: { role: v.role },
        create: v,
        update: { grants: v.grants },
      });
    }
    if (action === "user") {
      const v = z
        .object({
          id: z.string().optional(),
          username: z.string().regex(/^[a-z0-9._-]{3,80}$/),
          name: z.string().min(1).max(150),
          role: z.enum(roles),
          active: z.boolean(),
          password: z.string().max(128).optional(),
        })
        .parse(b);
      const { id, password, ...fields } = v;
      if (id === u.id && (!v.active || v.role !== "Admin"))
        throw new HttpError(
          400,
          "You cannot remove your own administrative access",
        );
      const passwordHash = password ? await hashPassword(password) : undefined;
      if (!id && !passwordHash)
        throw new HttpError(400, "A temporary password is required");
      await db.$transaction(
        async (tx) => {
          if (id) {
            const old = await tx.user.findUnique({ where: { id } });
            if (!old) throw new HttpError(404, "User not found");
            if (
              old.role === "Admin" &&
              old.active &&
              (!v.active || v.role !== "Admin") &&
              (await tx.user.count({
                where: { role: "Admin", active: true },
              })) <= 1
            )
              throw new HttpError(400, "Keep at least one active Admin");
            await tx.user.update({
              where: { id },
              data: {
                ...fields,
                ...(passwordHash
                  ? { password: passwordHash, mustChange: true }
                  : {}),
                version: { increment: 1 },
              },
            });
            await tx.session.deleteMany({ where: { userId: id } });
          } else
            await tx.user.create({
              data: { ...fields, password: passwordHash! },
            });
        },
        { isolationLevel: "Serializable" },
      );
    }
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
