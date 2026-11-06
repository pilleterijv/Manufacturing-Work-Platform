import { z } from "zod";
export const machineEventSchema = z
  .object({
    eventId: z.string().trim().min(1).max(150),
    machineId: z.string().trim().min(1).max(150),
    state: z.enum(["down", "running"]),
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type MachineEvent = z.infer<typeof machineEventSchema>;
export function sqlViewName(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(value))
    throw Error("Use an approved schema.view identifier");
  return value
    .split(".")
    .map((p) => `[${p}]`)
    .join(".");
}
export function sqlSequence(value: unknown) {
  const s = String(value);
  if (!/^\d{1,19}$/.test(s) || BigInt(s) > 9223372036854775807n)
    throw Error("Invalid SQL event sequence");
  return s;
}
