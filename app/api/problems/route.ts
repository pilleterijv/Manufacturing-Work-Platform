import {
  equipmentIds,
  assertEquipmentAccess,
  eligiblePeople,
  visiblePeople,
} from "@/lib/location-access";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireUser,
  jsonBody,
  grants,
  failure,
  HttpError,
  limit,
} from "@/lib/security";
import {
  problemSchema,
  defaultRequirements,
  actionSchema,
  methods,
  problemStatuses,
  actionStatuses,
  closureErrors,
  type Method,
} from "@/lib/problem-rules";
import { localToday, type ShiftConfig } from "@/lib/operations-rules";
import { streamWorkbook, paged } from "@/lib/excel-stream";
const idSchema = z.string().uuid();
const versionSchema = z.number().int().positive();
const history = (old: Prisma.JsonValue, entry: object) =>
  [...(Array.isArray(old) ? old : []), entry] as Prisma.InputJsonValue;
async function today() {
  const config = await db.setting.findUniqueOrThrow({
    where: { key: "shifts" },
  });
  return localToday((config.value as ShiftConfig).timezone);
}
export async function GET(req: Request) {
  try {
    const u = await requireUser("problems");
    const ids = await equipmentIds(u);
    const p = new URL(req.url).searchParams;
    if (p.get("id")) {
      const record = await db.problem.findUnique({
        where: { id: idSchema.parse(p.get("id")) },
        include: { actions: { orderBy: { id: "asc" } } },
      });
      if (!record) throw new HttpError(404, "Problem-solving record not found");
      await assertEquipmentAccess(u, record.equipmentId);
      return Response.json(record);
    }
    const department = z
      .string()
      .max(100)
      .parse(p.get("department") ?? "");
    const method = z
      .enum(methods)
      .optional()
      .parse(p.get("method") || undefined);
    const state = z
      .enum(problemStatuses)
      .optional()
      .parse(p.get("status") || undefined);
    const search = z
      .string()
      .max(150)
      .parse(p.get("search") ?? "");
    const scope: Prisma.ProblemWhereInput = {
      equipmentId: { in: ids },
      ...(department
        ? { equipmentSnapshot: { path: ["department"], equals: department } }
        : {}),
      ...(method ? { method } : {}),
      ...(state ? { status: state } : {}),
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: "insensitive" } },
              { title: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    if (p.get("format") === "xlsx") {
      await requireUser("export");
      return await streamWorkbook(
        "floorwork-problem-solving.xlsx",
        async (book) => {
          const records = book.addWorksheet("Problem solving"),
            actions = book.addWorksheet("Actions and checkpoints"),
            fields = book.addWorksheet("Methodology answers"),
            audit = book.addWorksheet("Change history");
          await records.addRow([
            "ID",
            "Reference",
            "Method",
            "Title",
            "Department",
            "Equipment",
            "Status",
            "Occurred",
            "Reported by",
            "Facilitator ID",
            "Reviewer ID",
            "Team",
            "Due",
            "Previous record ID",
            "Closed UTC",
          ]);
          await fields.addRow(["Reference", "Field", "Answer"]);
          await actions.addRow([
            "Reference",
            "Action ID",
            "Type",
            "Checkpoint",
            "Action",
            "Owner ID",
            "Due",
            "Status",
            "Comment",
            "Completed UTC",
            "Required for closure",
          ]);
          await audit.addRow(["Reference", "Entity", "Event JSON"]);
          for await (const r of paged((cursor) =>
            db.problem.findMany({
              where: scope,
              orderBy: { id: "asc" },
              take: 100,
              ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
              include: { actions: true },
            }),
          )) {
            const eq = r.equipmentSnapshot as Record<string, string>;
            await records.addRow([
              r.id,
              r.reference,
              r.method,
              r.title,
              eq.department,
              eq.name,
              r.status,
              r.occurredOn,
              r.reportedBy,
              r.ownerId,
              r.reviewerId,
              r.team,
              r.dueDate,
              r.previousId,
              r.closedAt?.toISOString(),
            ]);
            for (const [key, value] of Object.entries(
              r.answers as Record<string, string>,
            ))
              await fields.addRow([r.reference, key, value]);
            for (const e of r.history as object[])
              await audit.addRow([r.reference, "Record", JSON.stringify(e)]);
            for (const a of r.actions) {
              await actions.addRow([
                r.reference,
                a.id,
                a.type,
                a.checkpoint,
                a.title,
                a.ownerId,
                a.dueDate,
                a.status,
                a.comment,
                a.completedAt?.toISOString(),
                a.required,
              ]);
              for (const e of a.history as object[])
                await audit.addRow([r.reference, a.id, JSON.stringify(e)]);
            }
          }
        },
        req.signal,
      );
    }
    const cursor = idSchema.optional().parse(p.get("cursor") ?? undefined);
    if (p.get("view") === "queue") {
      const rows = await db.problemAction.findMany({
        where: { status: { not: "Completed" }, problem: scope },
        orderBy: { id: "asc" },
        take: 101,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          problem: {
            select: {
              id: true,
              reference: true,
              title: true,
              method: true,
              equipmentSnapshot: true,
            },
          },
        },
      });
      return Response.json({
        items: rows.slice(0, 100),
        hasMore: rows.length > 100,
        cursor: rows[99]?.id ?? null,
      });
    }
    const day = await today();
    const [
      rows,
      equipment,
      people,
      groups,
      openActions,
      closedActions,
      overdueActions,
      overdueCases,
    ] = await Promise.all([
      db.problem.findMany({
        where: scope,
        orderBy: { id: "asc" },
        take: 101,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          reference: true,
          method: true,
          title: true,
          status: true,
          dueDate: true,
          equipmentSnapshot: true,
          ownerId: true,
          reviewerId: true,
          version: true,
        },
      }),
      db.equipment.findMany({
        where: { id: { in: ids } },
        orderBy: { name: "asc" },
      }),
      visiblePeople(u, ids).then((ps) =>
        ps.map(({ id, name }) => ({ id, name })),
      ),
      db.problem.groupBy({
        by: ["method", "status"],
        where: scope,
        _count: true,
      }),
      db.problemAction.count({
        where: { problem: scope, status: { not: "Completed" } },
      }),
      db.problemAction.count({
        where: { problem: scope, status: "Completed" },
      }),
      db.problemAction.count({
        where: {
          problem: scope,
          status: { not: "Completed" },
          dueDate: { lt: day },
        },
      }),
      db.problem.count({
        where: {
          AND: [scope, { status: { not: "Closed" }, dueDate: { lt: day } }],
        },
      }),
    ]);
    const departments = equipment.map((e) => ({ department: e.department }));
    return Response.json({
      items: rows.slice(0, 100),
      hasMore: rows.length > 100,
      cursor: rows[99]?.id ?? null,
      equipment,
      people,
      departments: departments
        .map((d) => d.department)
        .filter(Boolean)
        .sort(),
      today: day,
      summary: {
        groups,
        openActions,
        closedActions,
        overdueActions,
        overdueCases,
      },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser("problems");
    await limit("problems:" + u.id, 120, 60);
    const body = await jsonBody(req);
    const action = z
      .enum(["create", "update", "addAction", "updateAction", "editAction"])
      .parse(body.action);
    const entry = { at: new Date().toISOString(), by: u.id, name: u.name };
    if (action === "create") {
      const input = problemSchema.parse(body);
      const [equipment, people, previous] = await Promise.all([
        db.equipment.findUnique({ where: { id: input.equipmentId } }),
        db.user.count({
          where: {
            id: { in: [...new Set([input.ownerId, input.reviewerId])] },
            active: true,
          },
        }),
        input.previousId
          ? db.problem.findUnique({ where: { id: input.previousId } })
          : null,
      ]);
      if (
        !equipment ||
        people !== new Set([input.ownerId, input.reviewerId]).size
      )
        throw new HttpError(
          400,
          "Choose valid equipment, facilitator and reviewer",
        );
      if (
        input.previousId &&
        (!previous ||
          methods.indexOf(input.method) <=
            methods.indexOf(previous.method as Method))
      )
        throw new HttpError(400, "Link a lower-level record when escalating");
      await assertEquipmentAccess(u, input.equipmentId);
      await eligiblePeople(input.equipmentId, [
        input.ownerId,
        input.reviewerId,
      ]);
      if (previous) {
        await assertEquipmentAccess(u, previous.equipmentId);
        if (previous.equipmentId !== input.equipmentId)
          throw new HttpError(
            400,
            "Escalations must retain the same equipment",
          );
      }
      const id = randomUUID(),
        reference = `${input.method}-${new Date().getUTCFullYear()}-${id.slice(0, 8).toUpperCase()}`;
      const record = await db.problem.create({
        data: {
          ...input,
          requirements: input.requirements ?? defaultRequirements(input.method),
          id,
          reference,
          equipmentSnapshot: equipment,
          createdBy: u.id,
          history: [{ ...entry, event: "Created", values: input }],
        },
      });
      return Response.json({ id: record.id, reference });
    }
    const id = idSchema.parse(body.id),
      version = versionSchema.parse(body.version);
    const g = await grants(u);
    const result = await db.$transaction(async (tx) => {
      // Serialize case edits, action changes and closure checks for this record.
      await tx.$queryRaw`SELECT id FROM "Problem" WHERE id=${id} FOR UPDATE`;
      const r = await tx.problem.findUnique({
        where: { id },
        include: { actions: true },
      });
      if (!r) throw new HttpError(404, "Record not found");
      await assertEquipmentAccess(u, r.equipmentId, tx);
      const lead =
        u.role === "Admin" ||
        u.id === r.ownerId ||
        u.id === r.createdBy ||
        u.id === r.reviewerId;
      const manager = g.includes("manage");
      if (action === "editAction") {
        if (!lead && !manager)
          throw new HttpError(
            403,
            "Only the problem leader or manager can edit action requirements",
          );
        if (r.status === "Closed")
          throw new HttpError(409, "Reopen the record before editing actions");
        const aid = idSchema.parse(body.actionId),
          old = r.actions.find((a) => a.id === aid);
        if (!old) throw new HttpError(404, "Action not found");
        if (old.version !== version)
          throw new HttpError(409, "Action changed; refresh before saving");
        const input = actionSchema.parse(body);
        await eligiblePeople(r.equipmentId, [input.ownerId], tx);
        await tx.problemAction.update({
          where: { id: aid },
          data: {
            ...input,
            version: { increment: 1 },
            history: history(old.history, {
              ...entry,
              event: "Action details and requirements edited",
              values: input,
            }),
          },
        });
        return tx.problem.update({
          where: { id: r.id },
          data: {
            version: { increment: 1 },
            history: history(r.history, {
              ...entry,
              event: "Action edited",
              actionId: aid,
              values: input,
            }),
          },
        });
      }
      if (action === "updateAction") {
        const aid = idSchema.parse(body.actionId),
          a = r.actions.find((a) => a.id === aid);
        if (!a) throw new HttpError(404, "Action not found");
        if (!lead && !manager && a.ownerId !== u.id)
          throw new HttpError(
            403,
            "Only the owner or problem team leader can update this action",
          );
        if (a.version !== version)
          throw new HttpError(
            409,
            "This action changed. Reload before updating",
          );
        if (r.status === "Closed")
          throw new HttpError(
            409,
            "Reopen the record before changing its actions",
          );
        const status = z.enum(actionStatuses).parse(body.status),
          comment = z.string().trim().min(1).max(2000).parse(body.comment);
        return tx.problemAction.update({
          where: { id: aid },
          data: {
            status,
            comment,
            completedAt: status === "Completed" ? new Date() : null,
            version: { increment: 1 },
            history: history(a.history, {
              ...entry,
              event: "Status update",
              from: a.status,
              status,
              comment,
            }),
          },
        });
      }
      if (!lead && !manager)
        throw new HttpError(
          403,
          "Only the record creator, facilitator, reviewer or manager can edit this record",
        );
      if (r.version !== version)
        throw new HttpError(409, "This record changed. Reload before saving");
      if (action === "addAction") {
        if (r.status === "Closed")
          throw new HttpError(409, "Reopen the record before adding actions");
        if (r.actions.length >= 100)
          throw new HttpError(400, "Maximum 100 actions per record");
        const input = actionSchema.parse(body);
        await eligiblePeople(r.equipmentId, [input.ownerId], tx);
        if (
          !(await tx.user.findFirst({
            where: { id: input.ownerId, active: true },
          }))
        )
          throw new HttpError(400, "Choose an active action owner");
        if (input.type === "Checkpoint" && r.method === "2D")
          throw new HttpError(400, "Checkpoints apply to 4D and 8D");
        await tx.problemAction.create({
          data: {
            ...input,
            problemId: id,
            history: [{ ...entry, event: "Created", values: input }],
          },
        });
        return tx.problem.update({
          where: { id },
          data: {
            version: { increment: 1 },
            history: history(r.history, {
              ...entry,
              event: "Action added",
              values: input,
            }),
          },
        });
      }
      const input = problemSchema.parse(body),
        status = z.enum(problemStatuses).parse(body.status);
      if (
        input.method !== r.method ||
        input.equipmentId !== r.equipmentId ||
        input.previousId !== r.previousId
      )
        throw new HttpError(
          400,
          "Method, equipment and previous record are fixed. Create a linked escalation to retain the original record",
        );
      if (r.status === "Closed" && status === "Closed")
        throw new HttpError(409, "Reopen this record before editing");
      if (
        (status === "Closed" || r.status === "Closed") &&
        u.role !== "Admin" &&
        u.id !== r.reviewerId
      )
        throw new HttpError(
          403,
          "Only the assigned reviewer or Admin can close or reopen this record",
        );
      const people = await tx.user.count({
        where: {
          id: { in: [...new Set([input.ownerId, input.reviewerId])] },
          active: true,
        },
      });
      if (people !== new Set([input.ownerId, input.reviewerId]).size)
        throw new HttpError(400, "Choose active facilitators and reviewers");
      await eligiblePeople(
        r.equipmentId,
        [input.ownerId, input.reviewerId],
        tx,
      );
      if (status === "Closed") {
        const missing = closureErrors(
          r.method as Method,
          input.answers,
          r.actions,
          input.requirements ??
            (r.requirements as any) ??
            defaultRequirements(r.method as Method),
        );
        if (missing.length)
          throw new HttpError(400, "Before closing: " + missing.join("; "));
      }
      return tx.problem.update({
        where: { id },
        data: {
          ...input,
          requirements:
            input.requirements ??
            r.requirements ??
            defaultRequirements(r.method as Method),
          status,
          closedAt: status === "Closed" ? new Date() : null,
          version: { increment: 1 },
          history: history(r.history, {
            ...entry,
            event: "Record updated",
            from: r.status,
            status,
            values: input,
          }),
        },
      });
    });
    return Response.json({ id: result.id });
  } catch (e) {
    return failure(e);
  }
}
