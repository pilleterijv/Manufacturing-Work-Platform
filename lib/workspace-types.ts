import type { Capability } from "./rules";
export type User = {
  id: string;
  name: string;
  username: string;
  role: string;
  mustChange: boolean;
  grants: Capability[];
};
export type Step = { id: string; text: string; photo: boolean };
export type Standard = {
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
export type Data = {
  page?: { hasMore: boolean; cursor: string | null };
  overview?: {
    runs: number;
    studies: number;
    audits: number;
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
  }[];
  users: any[];
  policies: { role: string; grants: Capability[] }[];
};
