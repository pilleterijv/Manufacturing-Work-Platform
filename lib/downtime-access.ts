import type { Prisma } from "@prisma/client";
import {
  downtimeAccessSchema,
  allowedDowntimeEquipment,
} from "./downtime-access-rules";
import { HttpError } from "./http-error";
export function downtimeEquipmentWhere(user: {
  role: string;
  downtimeAccess: unknown;
  workspaceAccess?: unknown;
}): Prisma.EquipmentWhereInput {
  if (user.role === "Admin") return {};
  const parsed = downtimeAccessSchema.safeParse(user.downtimeAccess);
  if (!parsed.success) return { id: { in: [] } };
  const a = parsed.data;
  const workspace =
    user.workspaceAccess === undefined
      ? null
      : downtimeAccessSchema.safeParse(user.workspaceAccess);
  if (workspace && (!workspace.success || workspace.data.mode !== "all")) {
    const base = downtimeEquipmentWhere({
      role: user.role,
      downtimeAccess: user.workspaceAccess,
    });
    const own = downtimeEquipmentWhere({
      role: user.role,
      downtimeAccess: user.downtimeAccess,
    });
    return { AND: [base, own] };
  }
  if (a.mode === "all") return {};
  return {
    OR: [
      { id: { in: a.equipmentIds } },
      ...a.locations.map((l) => ({
        plant: l.plant,
        department: l.department,
        ...(l.area === null ? {} : { area: l.area }),
      })),
    ],
  };
}
export async function authorizeDowntime(
  tx: Prisma.TransactionClient,
  user: { id: string; version: number },
  equipment: { id: string; plant: string; department: string; area: string },
) {
  // Share-lock the user's assignments while recording. Assignment updates acquire
  // an exclusive row lock, so revocation and start/stop have a definite order.
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR SHARE`;
  const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!fresh.active || fresh.version !== user.version)
    throw new HttpError(403, "Your account changed. Sign in again");
  if (
    !allowedDowntimeEquipment(fresh.role, fresh.downtimeAccess, equipment) ||
    !allowedDowntimeEquipment(fresh.role, fresh.workspaceAccess, equipment)
  )
    throw new HttpError(
      403,
      "You are not assigned to record downtime for this machine",
    );
}
