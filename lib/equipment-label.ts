import { z } from "zod";
export type LabeledEquipment = {
  id: string;
  name: string;
  plant: string;
  department: string;
  area: string;
  line?: string;
};
export function equipmentLabel(e: LabeledEquipment) {
  return [e.name, e.line, e.area, e.department, e.plant, `ID ${e.id}`]
    .filter(Boolean)
    .join(" · ");
}
export function focusedEquipmentIds(url: string, ids: string[]) {
  const id = z
    .string()
    .uuid()
    .optional()
    .parse(new URL(url).searchParams.get("equipment") || undefined);
  return id ? ids.filter((v) => v === id) : ids;
}
