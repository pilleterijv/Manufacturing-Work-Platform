import { z } from "zod";
import { db } from "./db";
import { localToday, type ShiftConfig } from "./operations-rules";
// Additional predicates always intersect the endpoint's existing access scope.
export async function workflowFocus(
  url: string,
  kind: string,
  userId: string,
): Promise<any> {
  const p = new URL(url).searchParams;
  const focus = z
    .enum(["", "open", "personal-open", "department-open", "overdue"])
    .parse(p.get("focus") || "");
  const item = z
    .string()
    .uuid()
    .optional()
    .parse(p.get("item") || undefined);
  const equipment = z
    .string()
    .uuid()
    .optional()
    .parse(p.get("equipment") || undefined);
  const plant = z
      .string()
      .max(150)
      .parse(p.get("plant") || ""),
    department = z
      .string()
      .max(150)
      .parse(p.get("focusDepartment") || "");
  const clauses: any[] = [];
  if (item) clauses.push({ id: item });
  if (equipment && kind !== "fiveS") clauses.push({ equipmentId: equipment });
  if (plant || department) {
    const where = {
      ...(plant ? { plant } : {}),
      ...(department ? { department } : {}),
    };
    const rows =
      kind === "fiveS"
        ? await db.location.findMany({ where, select: { id: true } })
        : await db.equipment.findMany({ where, select: { id: true } });
    clauses.push({
      [kind === "fiveS" ? "locationId" : "equipmentId"]: {
        in: rows.map((r) => r.id),
      },
    });
  }
  if (focus) {
    clauses.push(
      kind === "ideas"
        ? { status: { not: "Completed" } }
        : kind === "problems"
          ? { status: { not: "Closed" } }
          : kind === "defects"
            ? { status: "Open" }
            : { active: true },
    );
    if (focus === "personal-open")
      clauses.push(
        kind === "ideas"
          ? {
              OR: [
                { pilotId: userId },
                { validatorId: userId },
                { submitterId: userId },
                { participants: { some: { userId } } },
              ],
            }
          : kind === "problems"
            ? {
                OR: [
                  { ownerId: userId },
                  { reviewerId: userId },
                  {
                    actions: {
                      some: { ownerId: userId, status: { not: "Completed" } },
                    },
                  },
                ],
              }
            : kind === "defects"
              ? { OR: [{ reportedBy: userId }, { assigneeId: userId }] }
              : kind === "fiveS"
                ? {
                    OR: [
                      { assigneeIds: { array_contains: [userId] } },
                      { assigneeIds: { equals: [] } },
                    ],
                  }
                : { assigneeId: userId },
      );
  }
  if (
    focus === "overdue" &&
    ["ideas", "problems", "maintenance"].includes(kind)
  ) {
    const setting = await db.setting.findUniqueOrThrow({
        where: { key: "shifts" },
      }),
      today = localToday((setting.value as ShiftConfig).timezone);
    clauses.push({
      [kind === "maintenance" ? "nextDue" : "dueDate"]: { lt: today },
    });
  }
  return { AND: clauses };
}
