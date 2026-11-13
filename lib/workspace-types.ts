import type { AdminPrivilege } from "./delegation-rules";
import type { DashboardPreferences } from "./dashboard-preferences";
import type { Capability } from "./rules";
export type User = {
  id: string;
  name: string;
  username: string;
  role: string;
  customRole?: string | null;
  mustChange: boolean;
  grants: Capability[];
  adminPrivileges?: AdminPrivilege[];
  dashboardPreferences?: DashboardPreferences;
};
export type Step = {
  id: string;
  text: string;
  photo: boolean;
  fiveSPlanId?: string;
  group?: string;
  timing?: string;
};
export type Standard = {
  archived?: boolean;
  workflow?: string;
  kind: string;
  assigneeIds: string[];
  id: string;
  family: string;
  revision: number;
  title: string;
  equipmentId: string;
  target: number;
  tolerance: number;
  steps: Step[];
};
export type Cycle = { element: string; seconds: number; at: string };
export type Equipment = {
  id: string;
  name: string;
  plant: string;
  department: string;
  area: string;
  line: string;
};
export type Entry = {
  id: string;
  kind: string;
  created: string;
  user: { name: string };
  data: any;
};
export type Location = {
  id: string;
  plant: string;
  department: string;
  area: string;
  line: string;
  active: boolean;
};
export type Data = {
  locations?: Location[];
  page?: { hasMore: boolean; cursor: string | null };
  overview?: {
    runs: number;
    studies: number;
    audits: number;
    leaderWork?: number;
    followUps: number;
  };
  equipment: Equipment[];
  standards: Standard[];
  records: Entry[];
  content: {
    id: string;
    kind: string;
    title: string;
    equipmentId: string;
    body: string;
    media?: { id: string; kind: "photo" | "video"; caption: string }[];
  }[];
  users: any[];
  policies: {
    role: string;
    grants: Capability[];
    active?: boolean;
    baseRole?: string;
    adminPrivileges?: AdminPrivilege[];
    description?: string;
    version?: number;
  }[];
};
