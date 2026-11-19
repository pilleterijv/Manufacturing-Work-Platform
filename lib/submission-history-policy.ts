import type { Prisma } from "@prisma/client";
import { recordScope } from "./location-access";
// Read-only policy requested by the user: share submitted work inside the
// existing equipment scope. Never use this predicate to authorize a write.
export const historyKinds = (g: string[]) =>
  g.includes("history")
    ? ["run", "audit", "study", "pm", "cil", "centerline"]
    : [
        ...(g.includes("work") || g.includes("analytics") ? ["run"] : []),
        ...(g.includes("audits") ? ["audit"] : []),
        ...(g.includes("studies") || g.includes("analytics") ? ["study"] : []),
        ...(g.includes("maintenance") ? ["pm", "cil"] : []),
        ...(g.includes("centerlines") ? ["centerline"] : []),
      ];
export function readableSubmissionWhere(ids: string[], g: string[], userId: string): Prisma.RecordWhereInput {
  // Existing role grants stay intact. The optional history capability adds
  // area-wide read access only; without it, retain the existing own/team rules.
  return {
    AND: [recordScope(ids)],
    kind: { in: historyKinds(g) },
    ...(g.includes("history") || g.includes("analytics")
      ? {}
      : { OR: [{ userId }, { kind: { in: ["pm", "cil", "centerline"] } }] }),
  };
}
