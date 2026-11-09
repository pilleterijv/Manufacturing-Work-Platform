import { localToday } from "@/lib/operations-rules";
import { assertAreaAccess } from "@/lib/area-access";
import { readFilters, recordFilters } from "@/lib/filters";
import { ownEvidence, evidenceSchema } from "@/lib/evidence";
import { allowedDowntimeEquipment } from "@/lib/downtime-access-rules";
import {
  assignedEquipmentIds,
  equipmentScope,
  equipmentIds,
  recordScope,
  assertEquipmentAccess,
  eligiblePeople,
  visiblePeople,
} from "@/lib/location-access";
import { downtimeAccessSchema } from "@/lib/downtime-access-rules";
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
export async function GET(req: Request) {
  try {
    const u = await requireUser();
    const g = await grants(u);
    const ids = await equipmentIds(u);
    const { person, search } = readFilters(req.url);
    const assignmentIds = await assignedEquipmentIds(ids, person);
    const params = new URL(req.url).searchParams;
    const cursor = z
      .string()
      .uuid()
      .optional()
      .parse(params.get("cursor") ?? undefined);
    const view = z
      .enum([
        "full",
        "overview",
        "records",
        "work",
        "audits",
        "studies",
        "manage",
        "analytics",
        "training",
        "guides",
        "users",
        "policies",
        "equipment",
        "revisions",
      ])
      .parse(params.get("view") ?? "full");
    if (view === "revisions") {
      await requireUser("manage");
      const family = z.string().uuid().parse(params.get("family"));
      const before = z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .parse(params.get("before") ?? undefined);
      const revisions = await db.standard.findMany({
        where: {
          family,
          equipmentId: { in: ids },
          ...(before ? { revision: { lt: before } } : {}),
        },
        orderBy: { revision: "desc" },
        take: 101,
      });
      return Response.json({
        revisions: revisions.slice(0, 100),
        hasMore: revisions.length > 100,
      });
    }
    const overview = view === "overview" || view === "equipment";
    const history = [
      "full",
      "overview",
      "work",
      "audits",
      "studies",
      "analytics",
      "records",
    ].includes(view);
    const standardsNeeded = ["full", "work", "audits", "manage"].includes(view);
    const contentNeeded = ["full", "training", "guides"].includes(view);
    const kinds = [
      ...(g.includes("work") || g.includes("analytics") ? ["run"] : []),
      ...(g.includes("studies") || g.includes("analytics") ? ["study"] : []),
      ...(g.includes("audits") ? ["audit"] : []),
    ];
    const requestedKind = params.get("kind");
    const historyKind = view === "records" ? requestedKind : view;
    const scope = {
      AND: [recordScope(ids), recordFilters(person, search)],
      ...(g.includes("analytics") ? {} : { userId: u.id }),
      kind: {
        in:
          historyKind === "work"
            ? kinds.filter((k) => k === "run")
            : historyKind === "audits"
              ? kinds.filter((k) => k === "audit")
              : historyKind === "studies"
                ? kinds.filter((k) => k === "study")
                : kinds,
      },
    };
    if (params.get("view") === "records") {
      const rows = await db.record.findMany({
        where: scope,
        orderBy: [{ created: "desc" }, { id: "desc" }],
        take: 101,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { user: { select: { name: true } } },
      });
      const records = rows.slice(0, 100);
      return Response.json({
        records,
        page: {
          hasMore: rows.length > 100,
          cursor: records.at(-1)?.id ?? null,
        },
      });
    }
    const [counts, followUps] = history
      ? await Promise.all([
          db.record.groupBy({
            by: ["kind"],
            where: scope,
            _count: { _all: true },
          }),
          db.record.count({
            where: { ...scope, data: { path: ["followUp"], equals: true } },
          }),
        ])
      : [[], 0];

    const [equipment, standards, records, content, users, policies] =
      await Promise.all([
        db.equipment.findMany({
          where: { id: { in: assignmentIds } },
          orderBy: { name: "asc" },
        }),
        standardsNeeded
          ? db.$queryRaw<Prisma.StandardGetPayload<{}>[]>`
          SELECT s.* FROM "Standard" s JOIN (
            SELECT family, max(revision) AS revision FROM "Standard" GROUP BY family
          ) latest ON s.family=latest.family AND s.revision=latest.revision
          WHERE s."equipmentId" = ANY(${assignmentIds}::text[])
          AND (${view} NOT IN ('work','audits') OR s.kind=CASE WHEN ${view}='audits' THEN 'audit' ELSE 'run' END)
          AND (${view}<>'audits' OR ${u.role}='Admin' OR s."assigneeIds"='[]'::jsonb OR s."assigneeIds" @> ${JSON.stringify([u.id])}::jsonb)
          AND (${person ?? ""}='' OR s."assigneeIds"='[]'::jsonb OR s."assigneeIds" @> ${JSON.stringify(person ? [person] : [])}::jsonb)
          AND (${search}='' OR s.title ILIKE ${"%" + search + "%"})
          ORDER BY s.title
        `
          : [],
        history
          ? db.record.findMany({
              where: scope,
              orderBy: [{ created: "desc" }, { id: "desc" }],
              take: overview ? 8 : 101,
              include: { user: { select: { name: true } } },
            })
          : [],
        contentNeeded
          ? db.content.findMany({
              where: {
                active: true,
                ...(person ? { createdBy: person } : {}),
                ...(search
                  ? {
                      AND: [
                        {
                          OR: [
                            {
                              title: {
                                contains: search,
                                mode: "insensitive" as const,
                              },
                            },
                            {
                              body: {
                                contains: search,
                                mode: "insensitive" as const,
                              },
                            },
                          ],
                        },
                      ],
                    }
                  : {}),
                OR: [{ equipmentId: null }, { equipmentId: { in: ids } }],
                ...(view === "training"
                  ? { kind: "video" }
                  : view === "guides"
                    ? { kind: "guide" }
                    : {}),
              },
            })
          : [],
        (["full", "users"].includes(view) && g.includes("users")) ||
        (view === "manage" && g.includes("manage"))
          ? db.user.findMany({
              select: {
                id: true,
                username: true,
                name: true,
                role: true,
                active: true,
                mustChange: true,
                email: true,
                dashboardDepartment: true,
                overdueEmail: true,
                overdueInApp: true,
                ...(u.role === "Admin"
                  ? { downtimeAccess: true, workspaceAccess: true }
                  : {}),
              },
            })
          : [],
        ["full", "policies"].includes(view) && g.includes("permissions")
          ? db.policy.findMany()
          : [],
      ]);
    return Response.json({
      overview: {
        runs: counts.find((c) => c.kind === "run")?._count._all ?? 0,
        studies: counts.find((c) => c.kind === "study")?._count._all ?? 0,
        audits: counts.find((c) => c.kind === "audit")?._count._all ?? 0,
        followUps,
      },
      locations: await db.location.findMany({
        where: { active: true },
        orderBy: [
          { plant: "asc" },
          { department: "asc" },
          { area: "asc" },
          { line: "asc" },
        ],
      }),
      equipment,
      standards,
      page: {
        hasMore: !overview && records.length > 100,
        cursor: records.slice(0, overview ? 8 : 100).at(-1)?.id ?? null,
      },
      records: records
        .slice(0, overview ? 8 : 100)
        .filter((r) =>
          r.kind === "run"
            ? g.includes("work") || g.includes("analytics")
            : r.kind === "audit"
              ? g.includes("audits")
              : g.includes("studies") || g.includes("analytics"),
        ),
      content,
      users:
        u.role === "Admin"
          ? users.filter(
              (p) =>
                (!person || p.id === person) &&
                (!search ||
                  `${p.name} ${p.username}`
                    .toLowerCase()
                    .includes(search.toLowerCase())),
            )
          : (view === "manage" ? await visiblePeople(u, ids) : []).map(
              (person) => ({
                id: person.id,
                name: person.name,
                role: person.role,
                active: person.active,
              }),
            ),
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
        downtimeAccess: "users",
        workspaceAccess: "users",
        location: "manage",
        policy: "permissions",
      } as const
    )[action as "standard"];
    if (!cap) throw new HttpError(400, "Unknown action");
    const u = await requireUser(action === "archive" ? undefined : cap);
    if (["user", "policy", "location"].includes(action) && u.role !== "Admin")
      throw new HttpError(
        403,
        "Only Admin can manage accounts, policies and locations",
      );
    if (action === "location") {
      const v = z
        .object({
          plant: z.string().trim().min(1).max(100),
          department: z.string().trim().min(1).max(100),
          area: z.string().trim().max(100).default(""),
          line: z.string().trim().max(100).default(""),
        })
        .parse(b);
      if (v.line && !v.area)
        throw new HttpError(400, "Choose an area before adding a line");
      const rows = await db.location.findMany();
      const same = (a: string, c: string) =>
        a.trim().toLowerCase() === c.trim().toLowerCase();
      const plant = rows.find((r) => same(r.plant, v.plant));
      if (plant) v.plant = plant.plant;
      const parent = rows.find(
        (r) => same(r.plant, v.plant) && same(r.department, v.department),
      );
      if (parent) {
        v.plant = parent.plant;
        v.department = parent.department;
      }
      const area = rows.find(
        (r) =>
          r.plant === v.plant &&
          r.department === v.department &&
          same(r.area, v.area),
      );
      if (area) v.area = area.area;
      if (
        rows.some(
          (r) =>
            same(r.plant, v.plant) &&
            same(r.department, v.department) &&
            same(r.area, v.area) &&
            same(r.line, v.line),
        )
      )
        throw new HttpError(409, "This location already exists");
      await db.location.create({ data: v });
      return Response.json({ ok: true });
    }
    if (action === "downtimeAccess" || action === "workspaceAccess") {
      if (u.role !== "Admin")
        throw new HttpError(
          403,
          "Only Admin can assign departments, areas and machines",
        );
      const id = z.string().uuid().parse(b.id);
      const access = downtimeAccessSchema.parse(b.access);
      await db.$transaction(async (tx) => {
        const target = await tx.user.findUnique({ where: { id } });
        if (!target) throw new HttpError(404, "User not found");
        if (target.role === "Admin" && access.mode !== "all")
          throw new HttpError(400, "Admin retains access to every machine");
        const ids = [...new Set(access.equipmentIds)];
        if (
          (await tx.equipment.count({ where: { id: { in: ids } } })) !==
          ids.length
        )
          throw new HttpError(
            400,
            "One or more selected machines no longer exist",
          );
        for (const l of access.locations) {
          if (
            !(await tx.location.findFirst({
              where: {
                plant: l.plant,
                department: l.department,
                ...(l.area === null ? {} : { area: l.area }),
              },
            }))
          )
            throw new HttpError(400, "A selected location no longer exists");
        }
        await tx.user.update({
          where: { id },
          data:
            action === "workspaceAccess"
              ? { workspaceAccess: access, version: { increment: 1 } }
              : { downtimeAccess: access },
        });
      });
      return Response.json({ ok: true });
    }
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
      const loc = await db.location.findFirst({
        where: {
          plant: v.plant,
          department: v.department,
          area: v.area,
          ...(v.line ? { line: v.line } : {}),
          active: true,
        },
      });
      if (!loc)
        throw new HttpError(
          400,
          "Choose an existing location from the dropdowns. Admin can add locations first",
        );
      if (
        !allowedDowntimeEquipment(u.role, u.workspaceAccess, { ...loc, id: "" })
      )
        throw new HttpError(403, "This location is outside your assignments");
      if (
        await db.equipment.findFirst({
          where: { ...v, name: { equals: v.name.trim(), mode: "insensitive" } },
        })
      )
        throw new HttpError(
          409,
          "Equipment with this name already exists at this location",
        );
      await db.equipment.create({ data: { ...v, name: v.name.trim() } });
    }
    if (action === "standard") {
      const v = standardSchema.parse(b);
      if (!(await db.equipment.findUnique({ where: { id: v.equipmentId } })))
        throw new HttpError(400, "Select equipment");
      await assertEquipmentAccess(u, v.equipmentId);
      await eligiblePeople(v.equipmentId, v.assigneeIds);
      if (
        v.kind === "audit" &&
        (await db.user.count({
          where: {
            id: { in: v.assigneeIds },
            role: { in: ["Admin", "Manager", "DL/TL"] },
          },
        })) !== v.assigneeIds.length
      )
        throw new HttpError(
          400,
          "DL/TL tasks require DL/TL or Manager assignees",
        );
      for (const step of v.steps) {
        if (!step.fiveSPlanId) continue;
        if (v.kind !== "audit")
          throw new HttpError(400, "5S links belong to DL/TL standard work");
        const plan = await db.fiveSPlan.findUnique({
          where: { id: step.fiveSPlanId },
        });
        if (!plan?.active) throw new HttpError(400, "Choose an active 5S plan");
        const area = await assertAreaAccess(u, plan.locationId),
          eq = await db.equipment.findUniqueOrThrow({
            where: { id: v.equipmentId },
          });
        if (
          area.plant !== eq.plant ||
          area.department !== eq.department ||
          area.area !== eq.area
        )
          throw new HttpError(
            400,
            "The 5S plan must match the standard-work machine's area",
          );
      }
      const family = v.family ?? crypto.randomUUID();
      await db.$transaction(
        async (tx) => {
          const last = await tx.standard.findFirst({
            where: { family },
            orderBy: { revision: "desc" },
          });
          if (
            last &&
            (last.equipmentId !== v.equipmentId || last.kind !== v.kind)
          )
            throw new HttpError(
              400,
              "Equipment and task type cannot change within a standard family",
            );
          await assertEquipmentAccess(u, v.equipmentId, tx);
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
          id: z.string().uuid().optional(),
          media: z
            .array(
              z.object({
                id: z.string().uuid(),
                kind: z.enum(["photo", "video"]),
                caption: z.string().max(500),
              }),
            )
            .max(20)
            .default([]),
          title: z.string().min(1).max(150),
          equipmentId: z.string().optional(),
          body: z.string().max(10000).default(""),
        })
        .parse(b);
      if (
        v.equipmentId &&
        !(await db.equipment.findUnique({ where: { id: v.equipmentId } }))
      )
        throw new HttpError(400, "Unknown equipment");
      if (action === "guide" && !v.body.trim())
        throw new HttpError(400, "Enter instructions");
      if (action === "video" && v.body) {
        try {
          v.body = videoUrl(v.body);
        } catch {
          throw new HttpError(400, "Use an HTTPS YouTube or Vimeo video link");
        }
      }
      if (
        action === "video" &&
        !v.body &&
        !v.media.some((m) => m.kind === "video")
      )
        throw new HttpError(400, "Upload a video or enter a video link");
      if (v.equipmentId) await assertEquipmentAccess(u, v.equipmentId);
      else if (u.role !== "Admin")
        throw new HttpError(403, "Choose equipment in your assigned area");
      if (v.id) {
        const old = await db.content.findUnique({ where: { id: v.id } });
        if (!old || old.kind !== action)
          throw new HttpError(404, "Resource not found");
        if (old.equipmentId) await assertEquipmentAccess(u, old.equipmentId);
        else if (u.role !== "Admin")
          throw new HttpError(403, "Only Admin can edit shared resources");
      }
      for (const m of v.media) {
        const owned =
          m.kind === "photo"
            ? await db.photo.findFirst({ where: { id: m.id, userId: u.id } })
            : await db.guideMedia.findFirst({
                where: { id: m.id, userId: u.id },
              });
        const old = v.id
          ? await db.content.findUnique({ where: { id: v.id } })
          : null;
        const retained =
          old &&
          Array.isArray(old.media) &&
          old.media.some((x: any) => x.id === m.id && x.kind === m.kind);
        if (!owned && !retained)
          throw new HttpError(
            403,
            "Upload your own media or retain media already attached to this guide",
          );
      }
      const { id, ...fields } = v;
      const values = {
        ...fields,
        ...(!id ? { createdBy: u.id } : {}),
        equipmentId: v.equipmentId || null,
        kind: action,
      };
      if (id) await db.content.update({ where: { id }, data: values });
      else await db.content.create({ data: values });
    }
    if (action === "archive") {
      const id = z.string().parse(b.id);
      const item = await db.content.findUnique({ where: { id } });
      if (!item) throw new HttpError(404, "Not found");
      await requireUser(item.kind === "guide" ? "manage" : "training");
      if (item.equipmentId) await assertEquipmentAccess(u, item.equipmentId);
      else if (u.role !== "Admin")
        throw new HttpError(403, "Only Admin can archive shared resources");
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
                photo: z.string().uuid().nullable(),
                video: z.string().uuid().nullable().optional(),
                fiveSAuditId: z.string().uuid().optional(),
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
      await assertEquipmentAccess(u, standard.equipmentId);
      if (standard.kind !== action)
        throw new HttpError(400, "Choose the correct standard-work task type");
      if (
        action === "audit" &&
        u.role !== "Admin" &&
        (standard.assigneeIds as string[]).length &&
        !(standard.assigneeIds as string[]).includes(u.id)
      )
        throw new HttpError(
          403,
          "This DL/TL task is assigned to another person",
        );
      const steps = standard.steps as {
        id: string;
        text: string;
        photo: boolean;
        fiveSPlanId?: string;
      }[];
      if (
        v.responses.length !== steps.length ||
        new Set(v.responses.map((x) => x.stepId)).size !== steps.length ||
        steps.some(
          (s) =>
            !v.responses.some(
              (r) => r.stepId === s.id && (!s.photo || r.photo || r.video),
            ),
        )
      )
        throw new HttpError(400, "Complete every step and required photo");
      const photoIds = [
        ...new Set(
          v.responses
            .map((r) => r.photo)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (
        photoIds.length &&
        (await db.photo.count({
          where: { id: { in: photoIds }, userId: u.id },
        })) !== photoIds.length
      )
        throw new HttpError(403, "Photo must belong to you");
      await ownEvidence(
        u.id,
        v.responses.flatMap((r) => [
          ...(r.photo
            ? [{ id: r.photo, kind: "photo" as const, caption: "" }]
            : []),
          ...(r.video
            ? [{ id: r.video, kind: "video" as const, caption: "" }]
            : []),
        ]),
      );
      if (
        new Date(v.started) > new Date() ||
        Date.now() - +new Date(v.started) > 86400000
      )
        throw new HttpError(400, "Invalid start time");
      const data = {
        ...v,
        responses: v.responses.map((r) => ({
          ...r,
          at: r.at ?? new Date().toISOString(),
        })),
        snapshot: {
          ...standard,
          equipment: await db.equipment.findUniqueOrThrow({
            where: { id: standard.equipmentId },
          }),
        },
        completed: new Date().toISOString(),
        durationSeconds: (Date.now() - +new Date(v.started)) / 1000,
        followUp:
          v.responses.some((r) => !r.answer) ||
          (v.cycles ?? []).some(
            (c) => c.seconds > standard.target * (1 + standard.tolerance / 100),
          ),
      };
      await db.$transaction(async (tx) => {
        const machine = await assertEquipmentAccess(
          u,
          standard.equipmentId,
          tx,
        );
        for (const step of steps) {
          if (!step.fiveSPlanId) {
            if (v.responses.find((r) => r.stepId === step.id)?.fiveSAuditId)
              throw new HttpError(400, "This step has no linked 5S plan");
            continue;
          }
          const r = v.responses.find((r) => r.stepId === step.id),
            audit = r?.fiveSAuditId
              ? await tx.fiveSAudit.findUnique({
                  where: { id: r.fiveSAuditId },
                })
              : null;
          const zone = (
            await tx.setting.findUniqueOrThrow({ where: { key: "shifts" } })
          ).value as any;
          if (
            !audit ||
            audit.planId !== step.fiveSPlanId ||
            audit.userId !== u.id ||
            Date.now() - +audit.createdAt > 86400000 ||
            localToday(zone.timezone, audit.createdAt) !==
              localToday(zone.timezone)
          )
            throw new HttpError(
              400,
              "Complete today's linked 5S audit before saving this DL/TL step",
            );
          const area = await assertAreaAccess(u, audit.locationId, tx);
          if (
            area.plant !== machine.plant ||
            area.department !== machine.department ||
            area.area !== machine.area
          )
            throw new HttpError(
              400,
              "The completed 5S audit must match this machine's area",
            );
        }
        await tx.record.create({
          data: {
            kind: action,
            userId: u.id,
            standardId: standard.id,
            data: JSON.parse(JSON.stringify(data)),
          },
        });
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
      await assertEquipmentAccess(u, v.equipmentId);
      await db.record.create({
        data: {
          kind: "study",
          userId: u.id,
          data: {
            ...v,
            equipmentSnapshot: await db.equipment.findUniqueOrThrow({
              where: { id: v.equipmentId },
            }),
          },
        },
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
          email: z
            .union([z.email().max(254), z.literal("")])
            .optional()
            .transform((v) => (v === "" ? null : v)),
          name: z.string().min(1).max(150),
          role: z.enum(roles),
          active: z.boolean(),
          password: z.string().max(128).optional(),
        })
        .parse(b);
      const { id, password, ...fields } = v;
      if (u.role !== "Admin" && v.role === "Admin")
        throw new HttpError(403, "Only Admin can assign the Admin role");
      if (id === u.id && (!v.active || v.role !== u.role))
        throw new HttpError(
          400,
          "You cannot change your own role or deactivate yourself",
        );
      const passwordHash = password ? await hashPassword(password) : undefined;
      if (!id && !passwordHash)
        throw new HttpError(400, "A temporary password is required");
      await db.$transaction(
        async (tx) => {
          if (id) {
            const old = await tx.user.findUnique({ where: { id } });
            if (!old) throw new HttpError(404, "User not found");
            if (u.role !== "Admin" && old.role === "Admin")
              throw new HttpError(
                403,
                "Only Admin can edit administrator accounts",
              );
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
