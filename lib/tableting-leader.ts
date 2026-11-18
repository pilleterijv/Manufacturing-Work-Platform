import templates from "./data/tableting-leader-templates.json";
export { templates as tabletingLeaderTemplates };
export function handoffRooms(profile: string) {
  const names = templates.find((t) => t.key === profile)?.rooms || [];
  return names.map((room) => ({
    room,
    item: "",
    lot: "",
    targetSpeed: "",
    actualSpeed: "",
    remaining: "",
    issues: "",
    nextOrder: "" as const,
  }));
}
