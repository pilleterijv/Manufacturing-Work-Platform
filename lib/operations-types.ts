import type { EquipmentSnapshot, ShiftConfig } from "./operations-rules";
export type Person = { id: string; name: string; username?: string };
export type DownEvent = {
  id: string;
  equipmentId: string;
  reasonName: string;
  reasonId: string;
  equipmentSnapshot: EquipmentSnapshot;
  shiftConfig: ShiftConfig;
  startedAt: string;
  endedAt: string | null;
  starter: { name: string };
  stopper: { name: string } | null;
};
export type Idea = {
  id: string;
  title: string;
  equipmentSnapshot: EquipmentSnapshot;
  currentState: string;
  proposal: string;
  dueDate: string;
  status: string;
  version: number;
  createdAt: string;
  createdBy: string;
  pilot: Person;
  validator: Person;
  submitter: Person;
  creator: Person;
  participants: { user: Person }[];
};
export type OperationsData = {
  reasons: { id: string; name: string; active: boolean }[];
  config: ShiftConfig;
  serverNow: string;
  downtime: DownEvent[];
  ideas: Idea[];
  people: Person[];
  notifications: {
    id: string;
    ideaId: string;
    message: string;
    createdAt: string;
    readAt: string | null;
  }[];
};
export const emptyOperations: OperationsData = {
  reasons: [],
  config: {
    timezone: "America/Chicago",
    shifts: [
      { name: "Shift 1", startMinute: 360 },
      { name: "Shift 2", startMinute: 840 },
      { name: "Shift 3", startMinute: 1320 },
    ],
  },
  serverNow: new Date().toISOString(),
  downtime: [],
  ideas: [],
  people: [],
  notifications: [],
};
