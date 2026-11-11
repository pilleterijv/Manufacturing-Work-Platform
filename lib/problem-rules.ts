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
export const secondCauseFields: [string, string][] = [
  ...[1, 2, 3, 4, 5].map(
    (i) => [`why${i}b`, `Root cause path 2 · Why ${i}`] as [string, string],
  ),
  ["rootCause2", "Root cause path 2 · Root cause summary"],
];
const newOptional = new Set([
  "facilitatorDepartment",
  "nccapa",
  "sku",
  "sponsor",
  "severity",
  "occurrence",
  "internalExternal",
  "emergencyNeeded",
  "vagueProblem",
  "whyCare",
  "desiredDifference",
  "why6",
  "why7",
  "why6b",
  "why7b",
  ...secondCauseFields.map(([k]) => k),
]);
for (const method of methods) {
  methodology[method].sections[method === "8D" ? 1 : 0].fields.push([
    "facilitatorDepartment",
    "Facilitator department",
  ]);
  if (method === "2D") {
    methodology[method].sections[0].title =
      "D1 · Problem definition and standard check";
    methodology[method].sections[0].fields.push(
      ["standardExists", "Does a standard exist?"],
      ["standardClear", "Is the standard clear and available?"],
      ["trained", "Are people trained?"],
    );
    methodology[method].sections.at(-1)!.title =
      "D2 · Actions and effectiveness";
  }
  if (method !== "2D")
    methodology[method].sections.splice(
      methodology[method].sections.findIndex((s) =>
        s.fields.some(([key]) => key === "rootCause"),
      ) + 1,
      0,
      {
        title: "Second root cause path (optional)",
        fields: [
          ...secondCauseFields,
          ...(method === "8D"
            ? ([
                ["why6b", "Root cause path 2 · Why 6 (optional)"],
                ["why7b", "Root cause path 2 · Why 7 (optional)"],
              ] as [string, string][])
            : []),
        ],
      },
    );
}
methodology["8D"].sections[1].fields.push(
  ["nccapa", "NCCAPA number"],
  ["sku", "Product SKU / item number"],
  ["sponsor", "Champion / sponsor"],
  ["severity", "Severity · low / high"],
  ["occurrence", "Occurrence · 1–10+"],
  ["internalExternal", "Internal / external problem"],
  ["emergencyNeeded", "Emergency actions needed?"],
);
methodology["8D"].sections[2].fields.push(
  ["vagueProblem", "Initial / vague problem statement"],
  ["who", "Who is affected?"],
  ["what", "What is the symptom?"],
  ["when", "When did the symptom occur?"],
  ["where", "Where did the symptom occur?"],
  ["howMuch", "Cost or frequency"],
  ["whyCare", "Why do we care?"],
  ["desiredDifference", "How does this differ from the desired state?"],
);
for (const name of [
  "People",
  "Machine",
  "Process",
  "Material",
  "Measurement",
  "Environment",
]) {
  const key = "fishbone" + name;
  newOptional.add(key);
  methodology["8D"].sections[4].fields.push([key, `Fishbone · ${name}`]);
}
methodology["8D"].sections[4].fields.push(
  ["why6", "Why 6 (optional)"],
  ["why7", "Why 7 (optional)"],
);
for (const department of [
  "Operations",
  "Tech Ops",
  "Warehouse",
  "Quality Assurance",
  "Safety",
  "Quality Control",
  "Planning",
  "Engineering",
  "Maintenance",
]) {
  const key = "prevention" + department.replace(/\s/g, "");
  newOptional.add(key);
  methodology["8D"].sections
    .find((s) => s.title.startsWith("D7"))!
    .fields.push([key, `${department} · preventive actions required?`]);
}
methodology["2D"].guidance =
  "Document the factual problem and cause, check the standard and training, then assign correction/containment and corrective actions. Follow your site's escalation and due-date rules; the supplied leader-work example calls for a 2D after prolonged downtime.";
methodology["2D"].sections[1].title = "D1 · Root cause";
methodology["4D"].guidance =
  "Department investigation with standard checks, a focused problem statement, one or two independent 5-Why paths, owned actions, checkpoints and effectiveness review. Follow your site's escalation and due-date rules.";
methodology["8D"].guidance =
  "Cross-functional D0–D8 investigation using severity/occurrence, emergency containment, verified root and escape causes, corrective implementation, system-level prevention and team recognition.";
const allKeys = [
  "secondRootCauseEnabled",
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
  fields: methodology[method].sections
    .flatMap((s) => s.fields.map(([k]) => k))
    .filter(
      (k) =>
        !newOptional.has(k) &&
        !(
          method === "2D" &&
          [
            "standardExists",
            "standardClear",
            "trained",
            "preventive",
            "recognition",
          ].includes(k)
        ) &&
        !(
          method === "8D" &&
          ["who", "what", "when", "where", "howMuch"].includes(k)
        ),
    ),
  actionTypes: [] as (typeof actionTypes)[number][],
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
  requirements: {
    fields: string[];
    actionTypes: readonly string[];
    requireAction: boolean;
  } = defaultRequirements(method),
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
