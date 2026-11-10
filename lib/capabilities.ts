import { db } from "./db";
import {
  effectiveGrants,
  effectivePrivileges,
  type AdminPrivilege,
} from "./delegation-rules";
export async function grants(user: { role: string; id?: string }) {
  const fresh = user.id
    ? await db.user.findUnique({
        where: { id: user.id },
        select: {
          role: true,
          active: true,
          extraGrants: true,
          adminPrivileges: true,
        },
      })
    : null;
  if (user.id && !fresh?.active) return [];
  const role = fresh?.role ?? user.role,
    policy = await db.policy.findUnique({ where: { role } });
  return effectiveGrants(
    role,
    policy?.grants,
    fresh?.extraGrants,
    fresh?.adminPrivileges,
  );
}
export async function adminPrivileges(user: { id: string; role: string }) {
  const fresh = await db.user.findUnique({
    where: { id: user.id },
    select: { role: true, active: true, adminPrivileges: true },
  });
  return fresh?.active
    ? effectivePrivileges(fresh.role, fresh.adminPrivileges)
    : [];
}
export async function canAdminister(
  user: { id: string; role: string },
  key: AdminPrivilege,
) {
  return (await adminPrivileges(user)).includes(key);
}
