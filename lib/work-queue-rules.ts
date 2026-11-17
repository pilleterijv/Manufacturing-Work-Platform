import { endedShiftWindows } from "./shift-schedule-rules";
import { shiftConfigSchema } from "./operations-rules";
export type QueueItem = {
  id: string;
  type: string;
  title: string;
  equipmentId: string;
  assignee: string;
  due: string;
  status: string;
  priority: number;
  tab: string;
  filters: Record<string, string>;
  canPerform: boolean;
  detail?: string;
  timezone?: string;
};
export function nearbyShifts(config: unknown, now: Date) {
  return endedShiftWindows(
    shiftConfigSchema.parse(config),
    new Date(+now - 3 * 86400000),
    new Date(+now + 2 * 86400000),
  ).filter((w) => +w.start <= +now && +w.end > +now - 86400000);
}
export function scheduledQueue({
  schedules,
  standards,
  records,
  userId,
  team,
  grants,
  people,
  now,
}: {
  schedules: any[];
  standards: any[];
  records: any[];
  userId: string;
  team: boolean;
  grants: string[];
  people: Map<string, string>;
  now: Date;
}) {
  const familyStandards = new Map<string, any[]>(),
    familyRecords = new Map<string, any[]>();
  for (const s of standards) {
    const list = familyStandards.get(s.family) || [];
    list.push(s);
    familyStandards.set(s.family, list);
  }
  for (const r of records) {
    const list = familyRecords.get(r.standard.family) || [];
    list.push(r);
    familyRecords.set(r.standard.family, list);
  }
  for (const list of familyStandards.values())
    list.sort((a, b) => b.revision - a.revision);
  const rows: QueueItem[] = [];
  const counts: Record<string, number> = {};
  let truncated = false;
  const windows = new Map<string, ReturnType<typeof nearbyShifts>>();
  for (const schedule of schedules) {
    if (
      !grants.includes(schedule.kind === "audit" ? "audits" : "work") &&
      !(team && grants.includes("analytics"))
    )
      continue;
    const versions = familyStandards.get(schedule.family) || [],
      latest = versions[0];
    if (!latest) continue;
    const configKey = JSON.stringify(schedule.config);
    if (!windows.has(configKey))
      windows.set(configKey, nearbyShifts(schedule.config, now));
    for (const window of windows.get(configKey)!) {
      if (
        +window.start < +schedule.effectiveFrom ||
        !schedule.shiftNames.includes(window.name) ||
        !schedule.weekdays.includes(window.weekday)
      )
        continue;
      const expected = versions.find(
        (s) => +new Date(s.created) <= +window.start,
      );
      const assignees: string[] = schedule.assigneeIds.length
        ? schedule.assigneeIds
        : ["station"];
      for (const person of assignees) {
        if (!team && person !== "station" && person !== userId) continue;
        if (
          !team &&
          latest.kind === "audit" &&
          latest.assigneeIds?.length &&
          !latest.assigneeIds.includes(userId)
        )
          continue;
        const completed = (familyRecords.get(schedule.family) || []).some(
          (r) =>
            r.kind === schedule.kind &&
            (!expected || r.standard.revision >= expected.revision) &&
            +new Date(r.created) >= +window.start &&
            +new Date(r.created) < +window.end &&
            (person === "station" || r.userId === person),
        );
        const ended = +window.end <= +now,
          status = completed
            ? "Completed"
            : ended
              ? "Missed"
              : latest.archived
                ? "Needs setup"
                : "Due this shift";
        counts[status] = (counts[status] || 0) + 1;
        const tab =
          latest.kind === "run"
            ? "Standard work"
            : latest.workflow === "leader"
              ? "DL/TL Standard Work"
              : "Standard work audits";
        rows.push({
          id: `schedule:${schedule.id}:${+window.start}:${person}`,
          type:
            latest.kind === "run"
              ? "Operator check"
              : latest.workflow === "leader"
                ? "Leader check"
                : "Process audit",
          title: schedule.title,
          equipmentId: schedule.equipmentId,
          assignee:
            person === "station"
              ? "One completion per machine"
              : people.get(person) || "Reassignment needed",
          due: window.end.toISOString(),
          status,
          priority:
            status === "Missed"
              ? 1
              : status === "Needs setup"
                ? 0
                : status === "Completed"
                  ? 6
                  : 3,
          tab,
          filters: { equipment: schedule.equipmentId, standard: latest.id },
          canPerform:
            !ended &&
            !completed &&
            !latest.archived &&
            (person === "station" || person === userId) &&
            grants.includes(schedule.kind === "audit" ? "audits" : "work"),
          detail: `${window.name} · ${window.date} · ${schedule.config.timezone}`,
          timezone: schedule.config.timezone,
        });
        if (rows.length >= 1000) {
          rows.sort(queueOrder);
          rows.splice(500);
          truncated = true;
        }
      }
    }
  }
  rows.sort(queueOrder);
  return {
    rows: rows.slice(0, 500),
    counts,
    truncated: truncated || rows.length > 500,
  };
}
export function queueOrder(a: QueueItem, b: QueueItem) {
  return (
    a.priority - b.priority ||
    a.due.localeCompare(b.due) ||
    a.id.localeCompare(b.id)
  );
}
