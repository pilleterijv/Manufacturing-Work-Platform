import { annotateAutomaticTimers } from "@/lib/integrations";
import {
  downtimeEquipmentWhere,
  authorizeDowntime,
} from "@/lib/downtime-access";
import { z } from "zod";
import { decodeCursor, pageInfo } from "@/lib/pagination";
import { db } from "@/lib/db";
import {
  requireUser,
  grants,
  jsonBody,
  HttpError,
  failure,
  limit,
} from "@/lib/security";
import {
  shiftConfigSchema,
  ShiftConfig,
  splitDowntime,
  ideaSchema,
  ideaStatuses,
} from "@/lib/operations-rules";
export async function GET(req: Request) {
  try {
    const u = await requireUser();
    const g = await grants(u);
    const view = z
      .enum(["full", "summary", "live", "downtime", "ideas"])
      .parse(new URL(req.url).searchParams.get("view") ?? "full");
    const params = new URL(req.url).searchParams;
    const department = z
      .string()
      .max(100)
      .parse(params.get("department") ?? "");
    const cursor = decodeCursor(params.get("cursor"));
    const permittedEquipment =
      g.includes("downtime") && view !== "summary" && view !== "ideas"
        ? await db.equipment.findMany({
            where: downtimeEquipmentWhere(u),
            orderBy: { name: "asc" },
          })
        : [];
    const downtimeScope = {
      equipmentId: { in: permittedEquipment.map((e) => e.id) },
    };
    const location = department
      ? { equipmentSnapshot: { path: ["department"], equals: department } }
      : {};
    if (
      (view === "downtime" && !g.includes("downtime")) ||
      (view === "ideas" && !g.includes("ideas"))
    )
      throw new HttpError(403, "You do not have permission for this section");
    if (view === "summary" || view === "live") {
      const [setting, notifications, active] = await Promise.all([
        db.setting.findUniqueOrThrow({ where: { key: "shifts" } }),
        db.notification.findMany({
          where: { userId: u.id },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        view === "live" && g.includes("downtime")
          ? db.downtime.findMany({
              where: { ...location, ...downtimeScope, endedAt: null },
              include: {
                starter: { select: { name: true } },
                stopper: { select: { name: true } },
              },
            })
          : [],
      ]);
      return Response.json({
        config: setting.value,
        notifications,
        serverNow: new Date().toISOString(),
        ...(view === "live"
          ? {
              active: await annotateAutomaticTimers(active),
              equipment: permittedEquipment,
            }
          : {}),
      });
    }
    const [reasons, setting, downtime, ideas, people, notifications] =
      await Promise.all([
        view !== "ideas" && g.includes("downtime")
          ? db.downtimeReason.findMany({ orderBy: { name: "asc" } })
          : [],
        db.setting.findUniqueOrThrow({ where: { key: "shifts" } }),
        view !== "ideas" && g.includes("downtime")
          ? db.downtime.findMany({
              where: {
                ...location,
                ...downtimeScope,
                ...(cursor
                  ? {
                      OR: [
                        { startedAt: { lt: cursor.at } },
                        { startedAt: cursor.at, id: { lt: cursor.id } },
                      ],
                    }
                  : {}),
              },
              orderBy: [{ startedAt: "desc" }, { id: "desc" }],
              take: 101,
              include: {
                starter: { select: { name: true } },
                stopper: { select: { name: true } },
              },
            })
          : [],
        view !== "downtime" && g.includes("ideas")
          ? db.idea.findMany({
              where: {
                ...location,
                ...(cursor
                  ? {
                      OR: [
                        { createdAt: { lt: cursor.at } },
                        { createdAt: cursor.at, id: { lt: cursor.id } },
                      ],
                    }
                  : {}),
              },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 101,
              include: {
                pilot: { select: { id: true, name: true } },
                validator: { select: { id: true, name: true } },
                submitter: { select: { id: true, name: true } },
                creator: { select: { id: true, name: true } },
                participants: {
                  include: { user: { select: { id: true, name: true } } },
                },
              },
            })
          : [],
        view !== "downtime" && g.includes("ideas") && !cursor
          ? db.user.findMany({
              where: { active: true },
              select: { id: true, name: true, username: true },
              orderBy: { name: "asc" },
            })
          : [],
        db.notification.findMany({
          where: { userId: u.id },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      ]);
    const active =
      view !== "ideas" && g.includes("downtime")
        ? await db.downtime.findMany({
            where: { ...location, ...downtimeScope, endedAt: null },
            include: {
              starter: { select: { name: true } },
              stopper: { select: { name: true } },
            },
          })
        : [];
    const all = [
      ...new Map(
        [...downtime.slice(0, 100), ...active].map((e) => [e.id, e]),
      ).values(),
    ];
    const now = new Date();
    return Response.json({
      equipment: permittedEquipment,
      reasons,
      config: setting.value,
      serverNow: now.toISOString(),
      downtime: await annotateAutomaticTimers(all),
      ideas: ideas.slice(0, 100),
      downtimePage: pageInfo(downtime, (row) => row.startedAt),
      ideasPage: pageInfo(ideas, (row) => row.createdAt),
      people,
      notifications,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const b = await jsonBody(req);
    const action = z
      .enum([
        "reason",
        "shifts",
        "start",
        "stop",
        "idea",
        "ideaStatus",
        "readNotification",
      ])
      .parse(b.action);
    const u = await requireUser(
      action === "start" || action === "stop"
        ? "downtime"
        : action === "idea" || action === "ideaStatus"
          ? "ideas"
          : undefined,
    );
    if (action === "reason" || action === "shifts") {
      if (u.role !== "Admin")
        throw new HttpError(403, "Only Admin can configure reasons and shifts");
    }
    if (action === "reason") {
      const v = z
        .object({
          id: z.string().optional(),
          name: z.string().trim().min(1).max(100),
          active: z.boolean(),
        })
        .parse(b);
      if (v.id)
        await db.downtimeReason.update({
          where: { id: v.id },
          data: { name: v.name, active: v.active },
        });
      else
        await db.downtimeReason.create({
          data: { name: v.name, active: v.active },
        });
    }
    if (action === "shifts") {
      const config = shiftConfigSchema.parse(b.config);
      await db.setting.update({
        where: { key: "shifts" },
        data: { value: config },
      });
    }
    if (action === "start") {
      const v = z
        .object({ equipmentId: z.string(), reasonId: z.string() })
        .parse(b);
      await limit(`downtime:${u.id}`, 120, 3600);
      await db.$transaction(
        async (tx) => {
          const [equipment, reason, setting] = await Promise.all([
            tx.equipment.findUnique({ where: { id: v.equipmentId } }),
            tx.downtimeReason.findUnique({ where: { id: v.reasonId } }),
            tx.setting.findUniqueOrThrow({ where: { key: "shifts" } }),
          ]);
          if (!equipment || !reason?.active)
            throw new HttpError(400, "Select equipment and an enabled reason");
          await authorizeDowntime(tx, u, equipment);
          const config = shiftConfigSchema.parse(setting.value);
          await tx.downtime.create({
            data: {
              equipmentId: equipment.id,
              reasonId: reason.id,
              reasonName: reason.name,
              equipmentSnapshot: equipment,
              shiftConfig: config,
              startedBy: u.id,
              startedAt: new Date(),
            },
          });
        },
        { isolationLevel: "Serializable" },
      );
    }
    if (action === "stop") {
      const { id } = z.object({ id: z.string() }).parse(b);
      await db.$transaction(async (tx) => {
        const event = await tx.downtime.findUnique({
          where: { id },
          include: { equipment: true },
        });
        if (!event)
          throw new HttpError(
            409,
            "This downtime has already stopped or no longer exists",
          );
        await authorizeDowntime(tx, u, event.equipment);
        if (event.externalSourceId) {
          await tx.$queryRaw`SELECT id FROM "IntegrationSource" WHERE id=${event.externalSourceId} FOR SHARE`;
          const [source, binding] = await Promise.all([
            tx.integrationSource.findUnique({
              where: { id: event.externalSourceId },
            }),
            tx.machineBinding.findUnique({
              where: { equipmentId: event.equipmentId },
            }),
          ]);
          if (source?.active && binding?.active)
            throw new HttpError(
              409,
              "This timer is managed by its integration. Admin must disable its source or mapping before a manual stop",
            );
        }
        const result = await tx.downtime.updateMany({
          where: { id, endedAt: null },
          data: { endedAt: new Date(), stoppedBy: u.id },
        });
        if (!result.count)
          throw new HttpError(
            409,
            "This downtime has already stopped or no longer exists",
          );
      });
    }

    if (action === "idea") {
      await limit(`idea:${u.id}`, 30, 3600);
      const v = ideaSchema.parse(b);
      await db.$transaction(async (tx) => {
        const equipment = await tx.equipment.findUnique({
          where: { id: v.equipmentId },
        });
        if (!equipment)
          throw new HttpError(400, "Select equipment for department reporting");
        const ids = [
          ...new Set([
            v.pilotId,
            v.validatorId,
            v.submitterId,
            ...v.participantIds,
          ]),
        ];
        if (
          (await tx.user.count({
            where: { id: { in: ids }, active: true },
          })) !== ids.length
        )
          throw new HttpError(
            400,
            "Every assigned person must have an active account",
          );
        const { participantIds, ...fields } = v;
        const idea = await tx.idea.create({
          data: {
            ...fields,
            equipmentSnapshot: equipment,
            createdBy: u.id,
            participants: {
              create: participantIds.map((userId) => ({ userId })),
            },
          },
        });
        await tx.notification.create({
          data: {
            userId: v.pilotId,
            ideaId: idea.id,
            message: `You are the pilot for “${idea.title}”. Due ${idea.dueDate}. Open Improvement ideas to review the current state, proposal, validator, and participants.`,
          },
        });
      });
    }
    if (action === "ideaStatus") {
      const v = z
        .object({
          id: z.string(),
          version: z.number().int().positive(),
          status: z.enum(ideaStatuses),
        })
        .parse(b);
      const idea = await db.idea.findUnique({ where: { id: v.id } });
      if (!idea) throw new HttpError(404, "Idea not found");
      const allowed =
        u.role === "Admin" ||
        (v.status === "Completed"
          ? u.id === idea.validatorId
          : u.id === idea.pilotId || u.id === idea.validatorId);
      if (!allowed)
        throw new HttpError(
          403,
          "Only the pilot or validator can update progress; only the validator or Admin can complete it",
        );
      const result = await db.idea.updateMany({
        where: { id: v.id, version: v.version },
        data: { status: v.status, version: { increment: 1 } },
      });
      if (!result.count)
        throw new HttpError(
          409,
          "This idea changed. Refresh before updating it",
        );
    }
    if (action === "readNotification") {
      const { id } = z.object({ id: z.string() }).parse(b);
      const n = await db.notification.updateMany({
        where: { id, userId: u.id },
        data: { readAt: new Date() },
      });
      if (!n.count) throw new HttpError(404, "Notification not found");
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e) {
      if (e.code === "P2002" || e.code === "P2034")
        return Response.json(
          {
            error:
              "A matching reason or active timer already exists, or the record changed. Refresh and try again.",
          },
          { status: 409 },
        );
      if (e.code === "P2025")
        return Response.json({ error: "Record not found" }, { status: 404 });
    }
    return failure(e);
  }
}
