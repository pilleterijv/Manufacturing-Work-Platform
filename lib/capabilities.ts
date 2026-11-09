import { db } from "./db";
import { capabilities, type Capability } from "./rules";
export async function grants(user: { role: string }) {
  if (user.role === "Admin") return [...capabilities];
  const policy = await db.policy.findUnique({ where: { role: user.role } });
  return Array.isArray(policy?.grants)
    ? policy.grants.filter(
        (x): x is Capability =>
          typeof x === "string" && capabilities.includes(x as Capability),
      )
    : [];
}
