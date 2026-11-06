import { z } from "zod";
export const downtimeAccessSchema = z
  .object({
    mode: z.enum(["all", "restricted"]),
    locations: z
      .array(
        z
          .object({
            plant: z.string().max(100),
            department: z.string().max(100),
            // null grants the department; a string (including empty) grants one area.
            area: z.string().max(100).nullable(),
          })
          .strict(),
      )
      .max(200),
    equipmentIds: z.array(z.string().uuid()).max(1000),
  })
  .strict();
export type DowntimeAccess = z.infer<typeof downtimeAccessSchema>;
export const allDowntimeAccess: DowntimeAccess = {
  mode: "all",
  locations: [],
  equipmentIds: [],
};
export type LocationEquipment = {
  id: string;
  plant: string;
  department: string;
  area: string;
};
export function allowedDowntimeEquipment(
  role: string,
  raw: unknown,
  e: LocationEquipment,
) {
  if (role === "Admin") return true;
  const parsed = downtimeAccessSchema.safeParse(raw);
  if (!parsed.success) return false;
  const a = parsed.data;
  return (
    a.mode === "all" ||
    a.equipmentIds.includes(e.id) ||
    a.locations.some(
      (l) =>
        l.plant === e.plant &&
        l.department === e.department &&
        (l.area === null || l.area === e.area),
    )
  );
}
export const departmentKey = (e: { plant: string; department: string }) =>
  JSON.stringify([e.plant, e.department]);
