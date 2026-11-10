import { evidenceSchema } from "./evidence-schema";
import { z } from "zod";
export const methods = ["2D", "4D", "8D"] as const;
export type Method = (typeof methods)[number];
export const problemStatuses = [
  "Open",
  "In progress",
  "Verification",
  "Closed",
] as const;
export const actionStatuses = ["Open", "In progress", "Completed"] as const;
export const checkpoints = [
  "OPL",
  "SOP/JI",
  "Centerlines",
  "CILs",
  "PMs",
  "Training",
  "Poka-Yoke",
  "Safety",
  "Reapplication",
];
export const methodology: Record<
  Method,
  {
    description: string;
    guidance: string;
    sections: { title: string; fields: [string, string][] }[];
  }
> = {
  "2D": {
    description: "Find & fix · simple, one-time problems",
    guidance:
      "Known cause and solution; usually 5–60 minutes downtime. Target completion: less than 24 hours. Team Leader leads; Department Leader reviews. Repeated issues move to 4D.",
    sections: [
      {
        title: "1–2 · Identify & define",
        fields: [["problem", "Fact-based problem statement"]],
      },
      {
        title: "3 · Root cause",
        fields: [["rootCause", "What caused the problem?"]],
      },
      {
        title: "4 · Actions & effectiveness",
        fields: [
          ["correction", "Correction / containment / mitigation"],
          ["corrective", "Corrective action"],
          ["preventive", "Preventive actions"],
          ["recognition", "Team recognition"],
          ["effectiveness", "Effectiveness verification and evidence"],
        ],
      },
    ],
  },
  "4D": {
    description: "Department problem · recurring or medium complexity",
    guidance:
      "Use when 2D repeats, the cause is unknown, or downtime is over 60 to 360 minutes. Safety issues are at least 4D and must be reported to the manager. Target: 24–48 hours. Department Leader leads; Operations Manager reviews.",
    sections: [
      {
        title: "1 · Team & standard check",
        fields: [
          ["standardExists", "Does a standard exist?"],
          ["standardClear", "Is the standard clear and available?"],
          ["trained", "Are people trained?"],
        ],
      },
      {
        title: "2 · Define the problem",
        fields: [
          ["who", "Who is affected?"],
          ["what", "What happened?"],
          ["when", "When did it occur?"],
          ["where", "Where did it occur?"],
          ["howMuch", "How much / how many?"],
          ["problem", "Focused problem statement"],
        ],
      },
      {
        title: "3 · Root cause · 5-Why",
        fields: [
          ["why1", "Why 1"],
          ["why2", "Why 2"],
          ["why3", "Why 3"],
          ["why4", "Why 4"],
          ["why5", "Why 5"],
          ["rootCause", "Root cause summary"],
        ],
      },
      {
        title: "4 · Correct, prevent & verify",
        fields: [
          ["correction", "Correction / containment / mitigation"],
          ["corrective", "Corrective actions"],
          ["preventive", "Preventive actions"],
          ["recognition", "Team recognition"],
          ["effectiveness", "Effectiveness verification and evidence"],
        ],
      },
    ],
  },
  "8D": {
    description: "Major / complex issue · customer or cross-functional impact",
    guidance:
      "Use when multiple 4Ds have not resolved the issue, customers are affected, emergency containment is needed, or downtime exceeds 6 hours. Target: 7 calendar days. Engineering / Reliability leads; Department Manager and Site Director review, with BusEx coaching.",
    sections: [
      {
        title: "D0 · Emergency containment",
        fields: [["emergency", "Emergency actions"]],
      },
      {
        title: "D1 · Define team & scope",
        fields: [
          ["product", "Machine / product"],
          ["customer", "Internal / external customer impact"],
        ],
      },
      {
        title: "D2 · Define problem",
        fields: [
          ["problem", "Focused problem statement"],
          ["scope", "Scope and impact"],
        ],
      },
      {
        title: "D3 · Interim containment",
        fields: [
          ["correction", "Temporary actions protecting customer / process"],
        ],
      },
      {
        title: "D4 · Determine root cause",
        fields: [
          [
            "fishbone",
            "Fishbone analysis · people, machine, method, material, measurement, environment",
          ],
          ["why1", "Why 1"],
          ["why2", "Why 2"],
          ["why3", "Why 3"],
          ["why4", "Why 4"],
          ["why5", "Why 5"],
          ["rootCause", "Verified root cause"],
          ["escape", "Escape cause · why was it not detected?"],
        ],
      },
      {
        title: "D5 · Select & verify corrective action",
        fields: [
          ["corrective", "Selected corrective actions and verification"],
        ],
      },
      {
        title: "D6 · Implement corrective action",
        fields: [["implementation", "Implementation and results"]],
      },
      {
        title: "D7 · Prevent recurrence",
        fields: [["preventive", "System-level preventive actions"]],
      },
      {
        title: "D8 · Recognize & close",
        fields: [
          ["recognition", "Team recognition / supporting documentation"],
          ["effectiveness", "Effectiveness verification and evidence"],
        ],
      },
    ],
  },
};
const allKeys = [
  ...new Set(
    Object.values(methodology).flatMap((m) =>
      m.sections.flatMap((s) => s.fields.map(([key]) => key)),
    ),
  ),
];
export const answersSchema = z
  .record(z.string(), z.string().max(5000))
  .refine(
    (a) => Object.keys(a).every((k) => allKeys.includes(k)),
    "Unknown methodology field",
  );
export const actionTypes = [
  "Containment",
  "Correction",
  "Corrective",
  "Preventive",
  "Checkpoint",
] as const;
export const requirementsSchema = z
  .object({
    fields: z.array(z.string()).max(100),
    actionTypes: z.array(z.enum(actionTypes)).max(5),
    requireAction: z.boolean(),
  })
  .strict()
  .refine(
    (r) => r.fields.every((k) => allKeys.includes(k)),
    "Unknown required field",
  );
export const defaultRequirements = (method: Method) => ({
  fields: methodology[method].sections.flatMap((s) => s.fields.map(([k]) => k)),
  actionTypes: [] as string[],
  requireAction: true,
});
export const problemSchema = z.object({
  media: evidenceSchema.default([]),
  title: z.string().trim().min(1).max(150),
  method: z.enum(methods),
  equipmentId: z.string().uuid(),
  occurredOn: z.iso.date(),
  reportedBy: z.string().trim().min(1).max(150),
  ownerId: z.string().uuid(),
  reviewerId: z.string().uuid(),
  team: z.string().max(2000),
  dueDate: z.iso.date(),
  previousId: z.string().uuid().nullable(),
  answers: answersSchema,
  requirements: requirementsSchema.optional(),
});
export const actionSchema = z
  .object({
    media: evidenceSchema.default([]),
    required: z.boolean().default(true),
    type: z.enum([
      "Containment",
      "Correction",
      "Corrective",
      "Preventive",
      "Checkpoint",
    ]),
    title: z.string().trim().min(1).max(500),
    ownerId: z.string().uuid(),
    dueDate: z.iso.date(),
    checkpoint: z.string().max(100).default(""),
  })
  .superRefine((a, c) => {
    if (a.type === "Checkpoint" && !checkpoints.includes(a.checkpoint))
      c.addIssue({ code: "custom", message: "Choose a checkpoint" });
  });
export function closureErrors(
  method: Method,
  answers: Record<string, string>,
  actions: { status: string; required?: boolean; type?: string }[],
  requirements = defaultRequirements(method),
) {
  const errors = methodology[method].sections.flatMap((s) =>
    s.fields
      .filter(
        ([key]) => requirements.fields.includes(key) && !answers[key]?.trim(),
      )
      .map(([, label]) => label),
  );
  for (const type of requirements.actionTypes)
    if (!actions.some((a) => a.type === type && a.status === "Completed"))
      errors.push("Complete a " + type + " action");
  if (requirements.requireAction && !actions.length)
    errors.push("At least one tracked action");
  if (actions.some((a) => a.required !== false && a.status !== "Completed"))
    errors.push("Complete all actions and checkpoints");
  return errors;
}
export type ProblemInput = z.infer<typeof problemSchema>;
