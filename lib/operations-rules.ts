import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
export const shiftConfigSchema = z
  .object({
    timezone: z
      .string()
      .max(100)
      .refine((v) => {
        try {
          Temporal.Now.zonedDateTimeISO(v);
          return true;
        } catch {
          return false;
        }
      }, "Choose a valid IANA time zone"),
    shifts: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(50),
          startMinute: z.number().int().min(0).max(1439),
        }),
      )
      .min(1)
      .max(8),
  })
  .superRefine((c, ctx) => {
    if (
      new Set(c.shifts.map((s) => s.startMinute)).size !== c.shifts.length ||
      new Set(c.shifts.map((s) => s.name.toLowerCase())).size !==
        c.shifts.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Shift names and start times must be unique",
      });
  });
export type ShiftConfig = z.infer<typeof shiftConfigSchema>;
export type EquipmentSnapshot = {
  id: string;
  name: string;
  plant: string;
  department: string;
  area: string;
  line: string;
};
export type ShiftSlice = {
  shift: string;
  shiftDate: string;
  start: string;
  end: string;
  seconds: number;
};
export function splitDowntime(
  start: Date | string,
  end: Date | string,
  config: ShiftConfig,
): ShiftSlice[] {
  const from = +new Date(start),
    to = +new Date(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from)
    throw Error("Invalid downtime interval");
  if (to === from) return [];
  const first = Temporal.Instant.fromEpochMilliseconds(from)
      .toZonedDateTimeISO(config.timezone)
      .toPlainDate()
      .subtract({ days: 1 }),
    last = Temporal.Instant.fromEpochMilliseconds(to)
      .toZonedDateTimeISO(config.timezone)
      .toPlainDate()
      .add({ days: 1 });
  const boundaries: { at: number; shift: string; shiftDate: string }[] = [];
  let day = first;
  let count = 0;
  while (Temporal.PlainDate.compare(day, last) <= 0) {
    if (count++ > 3660) throw Error("Downtime interval exceeds ten years");
    for (const shift of config.shifts) {
      const time = Temporal.ZonedDateTime.from({
        timeZone: config.timezone,
        year: day.year,
        month: day.month,
        day: day.day,
        hour: Math.floor(shift.startMinute / 60),
        minute: shift.startMinute % 60,
      });
      boundaries.push({
        at: time.epochMilliseconds,
        shift: shift.name,
        shiftDate: day.toString(),
      });
    }
    day = day.add({ days: 1 });
  }
  boundaries.sort((a, b) => a.at - b.at);
  return boundaries.slice(0, -1).flatMap((b, i) => {
    const a = Math.max(from, b.at),
      z = Math.min(to, boundaries[i + 1].at);
    return z > a
      ? [
          {
            shift: b.shift,
            shiftDate: b.shiftDate,
            start: new Date(a).toISOString(),
            end: new Date(z).toISOString(),
            seconds: (z - a) / 1000,
          },
        ]
      : [];
  });
}
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    try {
      Temporal.PlainDate.from(v);
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid date");
export const ideaSchema = z.object({
  title: z.string().trim().min(1).max(150),
  equipmentId: z.string().min(1),
  currentState: z.string().trim().min(1).max(5000),
  proposal: z.string().trim().min(1).max(5000),
  dueDate: dateSchema,
  pilotId: z.string().min(1),
  validatorId: z.string().min(1),
  submitterId: z.string().min(1),
  participantIds: z
    .array(z.string().min(1))
    .max(100)
    .transform((v) => [...new Set(v)]),
});
export const ideaStatuses = [
  "Open",
  "Piloting",
  "Validation",
  "Completed",
] as const;
export function durationText(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 3600)
    .toString()
    .padStart(2, "0")}:${Math.floor((value % 3600) / 60)
    .toString()
    .padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}
export function localToday(timezone: string) {
  return Temporal.Now.zonedDateTimeISO(timezone).toPlainDate().toString();
}
