import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireUser,
  jsonBody,
  failure,
  HttpError,
  limit,
} from "@/lib/security";
import { roleSchema, builtinRole } from "@/lib/role-rules";
export async function GET() {
  try {
    const u = await requireUser();
    if (u.role !== "Admin")
      throw new HttpError(403, "Only Admin can manage roles");
    const [roles, audit] = await Promise.all([
      db.policy.findMany({ orderBy: { role: "asc" } }),
      db.roleAudit.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    ]);
    const assignments = await db.user.groupBy({
      by: ["customRole"],
      where: { customRole: { not: null } },
      _count: true,
    });
    const builtins = await db.user.groupBy({
      by: ["role"],
      where: { customRole: null },
      _count: true,
    });
    const actors = await db.user.findMany({
      where: { id: { in: [...new Set(audit.map((a) => a.actorId))] } },
      select: { id: true, name: true, username: true },
    });
    return Response.json({
      roles: roles.map((r) => ({
        ...r,
        assigned: builtinRole(r.role)
          ? builtins.find((a) => a.role === r.role)?._count || 0
          : assignments.find((a) => a.customRole === r.role)?._count || 0,
      })),
      audit: audit.map((a) => ({
        ...a,
        actorName: actors.find((u) => u.id === a.actorId)?.name || a.actorId,
      })),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser();
    if (u.role !== "Admin")
      throw new HttpError(403, "Only Admin can manage roles");
    await limit(`roles:${u.id}`, 60, 3600);
    const b = await jsonBody(req),
      action = z.enum(["create", "update", "retire"]).parse(b.action),
      name = z
        .string()
        .min(1)
        .max(60)
        .parse(b.role ?? b.name);
    if (name.toLowerCase() === "admin")
      throw new HttpError(400, "Admin is protected");
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"role:" + name.toLowerCase()},0))`;
      await tx.$queryRaw`SELECT role FROM "Policy" WHERE role=${name} FOR UPDATE`;
      const old = await tx.policy.findUnique({ where: { role: name } });
      if (action === "create") {
        if (
          builtinRole(name) ||
          (await tx.policy.findFirst({
            where: { role: { equals: name, mode: "insensitive" } },
          }))
        )
          throw new HttpError(409, "This role name is already in use");
        const v = roleSchema.parse({ ...b, name });
        const created = await tx.policy.create({
          data: {
            role: v.name,
            baseRole: v.baseRole,
            description: v.description,
            grants: [...new Set(v.grants)],
            adminPrivileges: [...new Set(v.adminPrivileges)],
          },
        });
        await tx.roleAudit.create({
          data: {
            actorId: u.id,
            role: created.role,
            action: "Created",
            snapshot: JSON.parse(JSON.stringify(created)),
          },
        });
      } else {
        if (
          !old ||
          !old.active ||
          old.version !== z.number().int().positive().parse(b.version)
        )
          throw new HttpError(
            409,
            "Role changed or retired; refresh before saving",
          );
        if (action === "retire") {
          if (builtinRole(name))
            throw new HttpError(400, "Built-in roles cannot be retired");
          if (await tx.user.count({ where: { customRole: name } }))
            throw new HttpError(
              409,
              "Reassign every account using this role before retiring it",
            );
          await tx.policy.update({
            where: { role: name },
            data: { active: false, version: { increment: 1 } },
          });
        } else {
          const v = roleSchema.parse({ ...b, name });
          if (v.baseRole !== old.baseRole)
            throw new HttpError(
              400,
              "Keep the workflow type; create a new role to change it",
            );
          await tx.policy.update({
            where: { role: name },
            data: {
              grants: [...new Set(v.grants)],
              adminPrivileges: [...new Set(v.adminPrivileges)],
              description: v.description,
              version: { increment: 1 },
            },
          });
        }
        const updated = await tx.policy.findUniqueOrThrow({
          where: { role: name },
        });
        await tx.roleAudit.create({
          data: {
            actorId: u.id,
            role: name,
            action: action === "retire" ? "Retired" : "Updated",
            snapshot: JSON.parse(
              JSON.stringify({ before: old, after: updated }),
            ),
          },
        });
      }
    });
    return Response.json({ ok: true });
  } catch (e) {
    if ((e as any)?.code === "P2002")
      return Response.json(
        { error: "Role name is already in use" },
        { status: 409 },
      );
    return failure(e);
  }
}
