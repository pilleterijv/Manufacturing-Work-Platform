import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { stepSchema } from "./rules";
export const maintenanceSchema = z
  .object({
    kind: z.enum(["pm", "cil"]).default("pm"),
    title: z.string().trim().min(1).max(150),
    equipmentId: z.string().uuid(),
    assigneeId: z.string().uuid(),
    intervalDays: z.number().int().min(1).max(3660),
    nextDue: z.iso.date(),
    active: z.boolean().default(true),
    steps: z.array(stepSchema).min(1).max(100),
  })
  .refine(
    (p) => new Set(p.steps.map((s) => s.id)).size === p.steps.length,
    "Step IDs must be unique",
  );
export function nextMaintenanceDate(
  due: string,
  today: string,
  interval: number,
) {
  const start = Temporal.PlainDate.from(due),
    day = Temporal.PlainDate.from(today),
    count = Math.max(1, Math.floor(start.until(day).days / interval) + 1);
  return start.add({ days: count * interval }).toString();
}
