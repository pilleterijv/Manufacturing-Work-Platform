import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireUser,
  jsonBody,
  failure,
  HttpError,
  hashPassword,
  limit,
} from "@/lib/security";
import { adminPrivileges } from "@/lib/capabilities";
import {
  effectiveGrants,
  effectivePrivileges,
  coversWorkspace,
  sharesWorkspace,
  protectedAccount,
  delegationSchema,
  privilegeDefinitions,
  additionalCapabilities,
  type AdminPrivilege,
} from "@/lib/delegation-rules";
import {
  downtimeAccessSchema,
  allowedDowntimeEquipment,
} from "@/lib/downtime-access-rules";
import { sendRecovery } from "@/lib/account-recovery";
const profile = z.object({
  name: z.string().trim().min(1).max(150),
  email: z
    .union([z.email().max(254), z.literal("")])
    .transform((v) => v || null),
  role: z.enum(["Operator", "DL/TL", "Manager"]),
});
const names = {
  create: "accounts.create",
  profile: "accounts.edit",
  active: "accounts.disable",
  password: "accounts.reset",
  email: "accounts.reset",
  access: "accounts.assign",
} as const;
export async function GET(req: Request) {
  try {
    const u = await requireUser(),
      privileges = await adminPrivileges(u);
    if (
      u.role !== "Admin" &&
      u.role !== "Manager" &&
      !privileges.some((p) => p.startsWith("accounts."))
    )
      throw new HttpError(
        403,
        "Department account management is not assigned to you",
      );
    const [people, equipment, locations, policies] = await Promise.all([
        db.user.findMany({ orderBy: { name: "asc" } }),
        db.equipment.findMany(),
        db.location.findMany({ where: { active: true } }),
        db.policy.findMany(),
      ]),
      policy = (role: string) => policies.find((p) => p.role === role)?.grants,
      actorCaps = effectiveGrants(
        u.role,
        policy(u.role),
        u.extraGrants,
        u.adminPrivileges,
      ),
      q =
        new URL(req.url).searchParams
          .get("search")
          ?.slice(0, 150)
          .toLowerCase() ?? "";
    const accounts = people
      .filter(
        (p) =>
          sharesWorkspace(u, p, equipment) &&
          (!q || `${p.name} ${p.username}`.toLowerCase().includes(q)),
      )
      .map((p) => {
        const caps = effectiveGrants(
            p.role,
            policy(p.role),
            p.extraGrants,
            p.adminPrivileges,
          ),
          canManage =
            u.role === "Admin" ||
            (p.id !== u.id &&
              !protectedAccount(p) &&
              coversWorkspace(u, p.workspaceAccess, equipment) &&
              caps.every((c) => actorCaps.includes(c)));
        const access = downtimeAccessSchema.safeParse(p.workspaceAccess),
          visibleAccess =
            u.role === "Admin" || canManage
              ? p.workspaceAccess
              : {
                  mode: "restricted",
                  locations: access.success
                    ? access.data.locations.filter((l) =>
                        coversWorkspace(
                          u,
                          {
                            mode: "restricted",
                            locations: [l],
                            equipmentIds: [],
                          },
                          equipment,
                        ),
                      )
                    : [],
                  equipmentIds: access.success
                    ? access.data.equipmentIds.filter((id) =>
                        equipment.some(
                          (e) =>
                            e.id === id &&
                            allowedDowntimeEquipment(
                              u.role,
                              u.workspaceAccess,
                              e,
                            ),
                        ),
                      )
                    : [],
                };
        return {
          id: p.id,
          username: p.username,
          name: p.name,
          email: p.email,
          role: p.role,
          active: p.active,
          mustChange: p.mustChange,
          version: p.version,
          workspaceAccess: visibleAccess,
          canManage,
          readOnlyReason: canManage
            ? ""
            : p.id === u.id
              ? "Use My account for your own password"
              : protectedAccount(p)
                ? "Protected role or individually privileged account; Admin manages this account"
                : "Account has assignments or permissions beyond your authority",
          ...(u.role === "Admin"
            ? { extraGrants: p.extraGrants, adminPrivileges: p.adminPrivileges }
            : {}),
        };
      });
    return Response.json({
      accounts,
      privileges,
      equipment: equipment.filter((e) =>
        allowedDowntimeEquipment(u.role, u.workspaceAccess, e),
      ),
      locations: locations.filter((l) =>
        allowedDowntimeEquipment(u.role, u.workspaceAccess, { ...l, id: "" }),
      ),
      privilegeDefinitions: u.role === "Admin" ? privilegeDefinitions : {},
      additionalCapabilities: u.role === "Admin" ? additionalCapabilities : [],
      canDelegate: u.role === "Admin",
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser(),
      b = await jsonBody(req),
      action = z
        .enum([
          "create",
          "profile",
          "active",
          "password",
          "email",
          "access",
          "delegation",
        ])
        .parse(b.action),
      id =
        action === "create"
          ? crypto.randomUUID()
          : z.string().uuid().parse(b.id);
    const initialPrivileges = effectivePrivileges(u.role, u.adminPrivileges);
    if (
      action === "delegation"
        ? u.role !== "Admin"
        : !initialPrivileges.includes(names[action] as AdminPrivilege)
    )
      throw new HttpError(
        403,
        "This account action has not been delegated to you",
      );
    await limit(`account-admin:${u.id}`, 100, 3600);
    const password =
      action === "password" || action === "create"
        ? await hashPassword(z.string().max(128).parse(b.password))
        : undefined;
    await db.$transaction(async (tx) => {
      const locks = [u.id, id].sort();
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=ANY(${locks}::text[]) ORDER BY id FOR UPDATE`;
      const actor = await tx.user.findUniqueOrThrow({ where: { id: u.id } }),
        target =
          action === "create"
            ? null
            : await tx.user.findUnique({ where: { id } });
      if (!actor.active || actor.version !== u.version)
        throw new HttpError(
          403,
          "Your account permissions changed; sign in again",
        );
      const privileges = effectivePrivileges(actor.role, actor.adminPrivileges);
      if (
        action === "delegation"
          ? actor.role !== "Admin"
          : !privileges.includes(names[action] as AdminPrivilege)
      )
        throw new HttpError(
          403,
          "This account action has not been delegated to you",
        );
      const eq = await tx.equipment.findMany(),
        policies = await tx.policy.findMany(),
        caps = (p: {
          role: string;
          extraGrants: unknown;
          adminPrivileges?: unknown;
        }) =>
          effectiveGrants(
            p.role,
            policies.find((q) => q.role === p.role)?.grants,
            p.extraGrants,
            p.adminPrivileges,
          ),
        actorCaps = caps(actor);
      if (action !== "create") {
        if (!target) throw new HttpError(404, "Account not found");
        if (
          actor.role !== "Admin" &&
          (target.id === actor.id ||
            protectedAccount(target) ||
            !sharesWorkspace(actor, target, eq) ||
            !coversWorkspace(actor, target.workspaceAccess, eq) ||
            !caps(target).every((c) => actorCaps.includes(c)))
        )
          throw new HttpError(
            403,
            "Admin must manage this protected, broader-permission or cross-department account",
          );
        if (z.number().int().positive().parse(b.version) !== target.version)
          throw new HttpError(409, "Account changed; reload before saving");
      }
      const checkAccess = async (raw: unknown) => {
        const access = downtimeAccessSchema.parse(raw);
        if (!coversWorkspace(actor, access, eq))
          throw new HttpError(
            403,
            "Assignments must stay within your current department/area/machine authority",
          );
        const loc = await tx.location.findMany({ where: { active: true } });
        if (
          access.equipmentIds.some((id) => !eq.some((e) => e.id === id)) ||
          access.locations.some(
            (l) =>
              !loc.some(
                (x) =>
                  x.plant === l.plant &&
                  x.department === l.department &&
                  (l.area === null || x.area === l.area),
              ),
          )
        )
          throw new HttpError(
            400,
            "Choose existing active locations and equipment",
          );
        if (
          actor.role !== "Admin" &&
          !access.locations.length &&
          !access.equipmentIds.length
        )
          throw new HttpError(
            400,
            "Keep a department, area or machine assignment; disable the account to remove access",
          );
        return access;
      };
      let audit: object = {};
      if (action === "create") {
        const v = profile.parse(b),
          username = z
            .string()
            .trim()
            .toLowerCase()
            .regex(/^[a-z0-9._-]{3,80}$/)
            .parse(b.username),
          access = await checkAccess(b.workspaceAccess);
        if (
          actor.role !== "Admin" &&
          (v.role === "Manager" ||
            !caps({ ...v, extraGrants: [] }).every((c) =>
              actorCaps.includes(c),
            ))
        )
          throw new HttpError(
            403,
            "You cannot create accounts with more authority than your own",
          );
        if (await tx.user.findUnique({ where: { username } }))
          throw new HttpError(409, "Username is already in use");
        await tx.user.create({
          data: {
            id,
            username,
            ...v,
            password: password!,
            workspaceAccess: access,
            downtimeAccess: { mode: "all", locations: [], equipmentIds: [] },
          },
        });
        audit = { ...v, username, workspaceAccess: access };
      } else if (action === "delegation") {
        if (target!.role === "Admin")
          throw new HttpError(
            400,
            "Admin retains full authority; delegate to a non-Admin account",
          );
        const v = delegationSchema.parse({
          extraGrants: b.extraGrants,
          adminPrivileges: b.adminPrivileges,
        });
        await tx.user.update({
          where: { id },
          data: {
            extraGrants: [...new Set(v.extraGrants)],
            adminPrivileges: [...new Set(v.adminPrivileges)],
            version: { increment: 1 },
          },
        });
        audit = v;
      } else if (action === "profile") {
        const v = profile.parse(b);
        if (target!.role === "Admin")
          throw new HttpError(
            400,
            "Use the Admin account editor for administrator roles",
          );
        if (
          actor.role !== "Admin" &&
          (v.role === "Manager" ||
            !caps({ ...v, extraGrants: target!.extraGrants }).every((c) =>
              actorCaps.includes(c),
            ))
        )
          throw new HttpError(403, "You cannot assign a more privileged role");
        await tx.user.update({
          where: { id },
          data: { ...v, version: { increment: 1 } },
        });
        audit = v;
      } else if (action === "active") {
        const active = z.boolean().parse(b.active);
        if (id === actor.id)
          throw new HttpError(400, "You cannot disable your own account");
        if (
          target!.role === "Admin" &&
          !active &&
          (await tx.user.count({ where: { role: "Admin", active: true } })) <= 1
        )
          throw new HttpError(400, "Keep an active Admin");
        await tx.user.update({
          where: { id },
          data: { active, version: { increment: 1 } },
        });
        audit = { active };
      } else if (action === "access") {
        if (target!.role === "Admin")
          throw new HttpError(400, "Admin retains full workspace access");
        const workspaceAccess = await checkAccess(b.workspaceAccess);
        await tx.user.update({
          where: { id },
          data: { workspaceAccess, version: { increment: 1 } },
        });
        audit = { workspaceAccess };
      } else if (action === "password") {
        await tx.user.update({
          where: { id },
          data: {
            password: password!,
            mustChange: true,
            version: { increment: 1 },
          },
        });
        audit = { temporaryPasswordSet: true };
      } else audit = { passwordEmailRequested: true };
      if (action !== "email")
        await tx.session.deleteMany({ where: { userId: id } });
      await tx.accountAudit.create({
        data: {
          actorId: actor.id,
          targetId: id,
          action,
          data: JSON.parse(JSON.stringify(audit)),
        },
      });
    });
    return Response.json({
      ok: true,
      id,
      ...(action === "email" ? { emailSent: await sendRecovery(id) } : {}),
    });
  } catch (e) {
    return failure(e);
  }
}
