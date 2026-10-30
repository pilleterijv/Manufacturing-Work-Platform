import type ExcelJS from "exceljs";
import { db } from "./db";
import { Capability } from "./rules";
import {
  splitDowntime,
  ShiftConfig,
  EquipmentSnapshot,
} from "./operations-rules";
export async function addOperationsSheets(
  book: ExcelJS.Workbook,
  grants: Capability[],
) {
  if (grants.includes("downtime")) {
    const events = book.addWorksheet("Downtime events"),
      shifts = book.addWorksheet("Downtime shifts");
    events.addRow([
      "ID",
      "Equipment",
      "Plant",
      "Department",
      "Area",
      "Line",
      "Reason",
      "Started UTC",
      "Ended UTC",
      "Seconds",
      "Started by",
      "Stopped by",
      "State",
    ]);
    shifts.addRow([
      "Event ID",
      "Equipment",
      "Department",
      "Shift date",
      "Shift",
      "Time zone",
      "Start UTC",
      "End UTC",
      "Seconds",
    ]);
    const downtime = await db.downtime.findMany({
      orderBy: { startedAt: "asc" },
      include: {
        starter: { select: { name: true } },
        stopper: { select: { name: true } },
      },
    });
    const now = new Date();
    for (const d of downtime) {
      const e = d.equipmentSnapshot as EquipmentSnapshot,
        c = d.shiftConfig as ShiftConfig;
      events.addRow([
        d.id,
        e.name,
        e.plant,
        e.department,
        e.area,
        e.line,
        d.reasonName,
        d.startedAt.toISOString(),
        d.endedAt?.toISOString() ?? "",
        (+(d.endedAt ?? now) - +d.startedAt) / 1000,
        d.starter.name,
        d.stopper?.name ?? "",
        d.endedAt ? "Stopped" : "In progress",
      ]);
      for (const s of splitDowntime(d.startedAt, d.endedAt ?? now, c))
        shifts.addRow([
          d.id,
          e.name,
          e.department,
          s.shiftDate,
          s.shift,
          c.timezone,
          s.start,
          s.end,
          s.seconds,
        ]);
    }
  }
  if (grants.includes("ideas")) {
    const sheet = book.addWorksheet("Improvement ideas");
    sheet.addRow([
      "ID",
      "Title",
      "Equipment",
      "Department",
      "Current state",
      "Proposal",
      "Due date",
      "Status",
      "Submitter",
      "Pilot",
      "Validator",
      "Participants",
      "Created by",
      "Created UTC",
    ]);
    const ideas = await db.idea.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        submitter: { select: { name: true } },
        pilot: { select: { name: true } },
        validator: { select: { name: true } },
        creator: { select: { name: true } },
        participants: { include: { user: { select: { name: true } } } },
      },
    });
    for (const i of ideas) {
      const e = i.equipmentSnapshot as EquipmentSnapshot;
      sheet.addRow([
        i.id,
        i.title,
        e.name,
        e.department,
        i.currentState,
        i.proposal,
        i.dueDate,
        i.status,
        i.submitter.name,
        i.pilot.name,
        i.validator.name,
        i.participants.map((p) => p.user.name).join(", "),
        i.creator.name,
        i.createdAt.toISOString(),
      ]);
    }
  }
}
