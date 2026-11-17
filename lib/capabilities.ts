import { roleAuthority } from "./role-rules";
import { db } from "./db";
import { type AdminPrivilege } from "./delegation-rules";
export async function authority(user: { role: string; id?: string }) {
  const fresh = user.id
    ? await db.user.findUnique({
        where: { id: user.id },
        select: {
          role: true,
          active: true,
          customRole: true,
          extraGrants: true,
          adminPrivileges: true,
        },
      })
    : null;
  if (user.id && !fresh?.active) return { grants: [], privileges: [] };
  const subject = fresh ?? user;
  const policy = await db.policy.findUnique({
    where: { role: fresh?.customRole || subject.role },
  });
  return roleAuthority(subject, policy ?? undefined);
}
export async function grants(user: { role: string; id?: string }) {
  return (await authority(user)).grants;
}
export async function adminPrivileges(user: { id: string; role: string }) {
  return (await authority(user)).privileges;
}
export async function canAdminister(
  user: { id: string; role: string },
  key: AdminPrivilege,
) {
  return (await adminPrivileges(user)).includes(key);
}
