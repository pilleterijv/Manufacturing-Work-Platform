import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { type ShiftConfig } from "./operations-rules";
export const workScheduleSchema = z.object({
  family: z.string().uuid(),
  managerIds: z.array(z.string().uuid()).min(1).max(50),
  assigneeIds: z.array(z.string().uuid()).max(1000),
  shiftNames: z.array(z.string().min(1).max(50)).min(1).max(8),
  weekdays: z
    .array(z.number().int().min(1).max(7))
    .min(1)
    .max(7)
    .default([1, 2, 3, 4, 5, 6, 7]),
  notifyInApp: z.boolean(),
  notifyEmail: z.boolean(),
});
export function endedShiftWindows(config: ShiftConfig, after: Date, now: Date) {
  const first = Temporal.Instant.fromEpochMilliseconds(+after)
    .toZonedDateTimeISO(config.timezone)
    .toPlainDate()
    .subtract({ days: 1 });
  const final = Temporal.Instant.fromEpochMilliseconds(+now)
    .toZonedDateTimeISO(config.timezone)
    .toPlainDate()
    .add({ days: 1 });
  const boundaries: { at: number; name: string; date: string }[] = [];
  let day = first;
  for (
    let i = 0;
    i < 34 && Temporal.PlainDate.compare(day, final) <= 0;
    i++, day = day.add({ days: 1 })
  )
    for (const s of config.shifts) {
      const at = Temporal.ZonedDateTime.from({
        timeZone: config.timezone,
        year: day.year,
        month: day.month,
        day: day.day,
        hour: Math.floor(s.startMinute / 60),
        minute: s.startMinute % 60,
      }).epochMilliseconds;
      boundaries.push({ at, name: s.name, date: day.toString() });
    }
  boundaries.sort((a, b) => a.at - b.at);
  return boundaries
    .slice(0, -1)
    .map((s, i) => ({
      start: new Date(s.at),
      end: new Date(boundaries[i + 1].at),
      name: s.name,
      date: s.date,
      weekday: Temporal.PlainDate.from(s.date).dayOfWeek,
    }))
    .filter((s) => +s.end > +after && +s.end <= +now);
}
