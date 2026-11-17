import { db } from "./db";
import type { Prisma } from "@prisma/client";
import { HttpError } from "./http-error";
import { builtinRole } from "./role-rules";
export async function resolveRole(
  name: string,
  tx: Prisma.TransactionClient = db,
) {
  await tx.$queryRaw`SELECT role FROM "Policy" WHERE role=${name} FOR SHARE`;
  const policy = await tx.policy.findUnique({ where: { role: name } });
  if (!policy?.active) throw new HttpError(400, "Choose an active role");
  if (builtinRole(name)) return { role: name, customRole: null };
  if (!["Operator", "DL/TL", "Manager"].includes(policy.baseRole))
    throw new HttpError(400, "Invalid custom role workflow");
  return { role: policy.baseRole, customRole: policy.role };
}
