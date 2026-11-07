import { allowedDowntimeEquipment } from "./downtime-access-rules";
import { db } from "./db";
import { endedShiftWindows } from "./shift-schedule-rules";
import { shiftConfigSchema } from "./operations-rules";
export async function checkShiftWork(now = new Date()) {
  const schedules = await db.workSchedule.findMany({
    where: { active: true },
    orderBy: { checkedThrough: "asc" },
    take: 100,
  });
  let evaluated = 0,
    missed = 0;
  for (const schedule of schedules) {
    const config = shiftConfigSchema.parse(schedule.config),
      names = schedule.shiftNames as string[];
    for (const window of endedShiftWindows(
      config,
      schedule.checkedThrough,
      now,
    ).slice(0, 100)) {
      await db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "WorkSchedule" WHERE id=${schedule.id} FOR UPDATE`;
          const current = await tx.workSchedule.findUniqueOrThrow({
            where: { id: schedule.id },
          });
          if (!current.active || +current.checkedThrough >= +window.end) return;
          if (
            +window.start >= +current.effectiveFrom &&
            names.includes(window.name) &&
            (current.weekdays as number[]).includes(window.weekday)
          ) {
            const assignees = current.assigneeIds as string[],
              managerIds = current.managerIds as string[];
            const expected = await tx.standard.findFirst({
              where: {
                family: current.family,
                equipmentId: current.equipmentId,
                created: { lte: window.start },
              },
              orderBy: { revision: "desc" },
            });
            for (const assigneeKey of assignees.length
              ? assignees
              : ["station"]) {
              const exists = await tx.shiftCheck.findUnique({
                where: {
                  scheduleId_shiftStart_assigneeKey: {
                    scheduleId: current.id,
                    shiftStart: window.start,
                    assigneeKey,
                  },
                },
              });
              if (exists) continue;
              const record = await tx.record.findFirst({
                where: {
                  kind: current.kind,
                  standard: {
                    family: current.family,
                    equipmentId: current.equipmentId,
                    ...(expected
                      ? { revision: { gte: expected.revision } }
                      : {}),
                  },
                  created: { gte: window.start, lt: window.end },
                  ...(assigneeKey === "station" ? {} : { userId: assigneeKey }),
                },
                orderBy: { created: "asc" },
                select: { id: true },
              });
              const check = await tx.shiftCheck.create({
                data: {
                  scheduleId: current.id,
                  shiftStart: window.start,
                  shiftEnd: window.end,
                  shiftName: window.name,
                  assigneeKey,
                  missed: !record,
                  completedRecordId: record?.id,
                  expectedStandardId: expected?.id,
                },
              });
              evaluated++;
              if (!record) {
                missed++;
                const equipment = await tx.equipment.findUniqueOrThrow({
                  where: { id: current.equipmentId },
                });
                const assignee =
                  assigneeKey === "station"
                    ? null
                    : await tx.user.findUnique({
                        where: { id: assigneeKey },
                        select: { name: true },
                      });
                const message = `Standard work not completed: ${current.title}. ${equipment.plant} / ${equipment.department} / ${equipment.area} / ${equipment.name}. ${window.name} (${window.date}, ${config.timezone}), ending ${window.end.toISOString()}. ${assignee ? `Assigned to ${assignee.name}.` : "One station completion was required."} Alert ID: ${check.id}.`;
                const managers = await tx.user.findMany({
                  where: {
                    id: { in: managerIds },
                    active: true,
                    role: { in: ["Admin", "Manager", "DL/TL"] },
                  },
                });
                for (const manager of managers.filter((m) =>
                  allowedDowntimeEquipment(
                    m.role,
                    m.workspaceAccess,
                    equipment,
                  ),
                )) {
                  if (current.notifyInApp)
                    await tx.notification.create({
                      data: {
                        userId: manager.id,
                        kind: "missed-work",
                        sourceId: check.id,
                        message,
                      },
                    });
                  if (current.notifyEmail)
                    await tx.emailDelivery.create({
                      data: {
                        scheduleId: current.id,
                        checkId: check.id,
                        userId: manager.id,
                        subject: `Missed shift standard work: ${current.title}`,
                        message,
                      },
                    });
                }
              }
            }
          }
          await tx.workSchedule.update({
            where: { id: current.id },
            data: { checkedThrough: window.end },
          });
        },
        { timeout: 30000 },
      );
    }
  }
  await db.setting.upsert({
    where: { key: "shift-monitor-health" },
    create: {
      key: "shift-monitor-health",
      value: { checkedAt: now.toISOString(), evaluated, missed },
    },
    update: { value: { checkedAt: now.toISOString(), evaluated, missed } },
  });
  return { evaluated, missed };
}
