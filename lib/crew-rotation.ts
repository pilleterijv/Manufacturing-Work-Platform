import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
export const crewSchema = z.object({
  name: z.string().trim().min(1).max(50),
  shiftName: z.string().min(1).max(50),
  anchorDate: z.iso.date(),
  workingDays: z
    .array(z.boolean())
    .min(2)
    .max(28)
    .refine(
      (v) => v.some(Boolean) && v.some((x) => !x),
      "Include working and off days",
    ),
});
export function crewWorks(crew: z.infer<typeof crewSchema>, date: string) {
  const offset = Temporal.PlainDate.from(crew.anchorDate).until(
    Temporal.PlainDate.from(date),
  ).days;
  return crew.workingDays[
    ((offset % crew.workingDays.length) + crew.workingDays.length) %
      crew.workingDays.length
  ];
}
export function scheduleWindowMatches(
  schedule: {
    shiftNames: unknown;
    weekdays: unknown;
    crewNames?: unknown;
    config: unknown;
  },
  window: { name: string; date: string; weekday: number },
) {
  const crews = (schedule.crewNames || []) as string[];
  if (crews.length) {
    const config = schedule.config as { crews?: z.infer<typeof crewSchema>[] };
    return !!config.crews?.some(
      (c) =>
        crews.includes(c.name) &&
        c.shiftName === window.name &&
        crewWorks(c, window.date),
    );
  }
  return (
    (schedule.shiftNames as string[]).includes(window.name) &&
    (schedule.weekdays as number[]).includes(window.weekday)
  );
}

export function plantCrewPreset() {
  const paired = [
    true,
    true,
    false,
    false,
    true,
    true,
    true,
    false,
    false,
    true,
    true,
    false,
    false,
    false,
  ];
  return {
    shifts: [
      { name: "Day", startMinute: 330 },
      { name: "Night", startMinute: 1050 },
    ],
    crews: [
      {
        name: "Shift 4",
        shiftName: "Day",
        anchorDate: "2026-11-16",
        workingDays: paired,
      },
      {
        name: "Shift 7",
        shiftName: "Night",
        anchorDate: "2026-11-16",
        workingDays: paired,
      },
      {
        name: "Shift 5",
        shiftName: "Day",
        anchorDate: "2026-11-16",
        workingDays: paired.map((x) => !x),
      },
      {
        name: "Shift 6",
        shiftName: "Night",
        anchorDate: "2026-11-16",
        workingDays: paired.map((x) => !x),
      },
    ],
  };
}
