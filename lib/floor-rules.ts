import { z } from "zod";
import { evidenceSchema } from "./evidence-schema";
export const fiveSPillars = [
  "Sort",
  "Set in order",
  "Shine",
  "Standardize",
  "Sustain",
] as const;
export const fiveSQuestion = z.object({
  id: z.string().uuid(),
  pillar: z.enum(fiveSPillars),
  text: z.string().trim().min(1).max(500),
  photo: z.boolean(),
});
export const fiveSPlanSchema = z
  .object({
    locationId: z.string().uuid(),
    title: z.string().trim().min(1).max(150),
    questions: z.array(fiveSQuestion).min(5).max(100),
    assigneeIds: z.array(z.string().uuid()).max(1000),
    active: z.boolean(),
  })
  .superRefine((v, c) => {
    if (new Set(v.questions.map((q) => q.id)).size !== v.questions.length)
      c.addIssue({ code: "custom", message: "Question IDs must be unique" });
    if (fiveSPillars.some((p) => !v.questions.some((q) => q.pillar === p)))
      c.addIssue({ code: "custom", message: "Include all five 5S pillars" });
  });
export const fiveSResponse = z.object({
  questionId: z.string().uuid(),
  score: z.number().int().min(0).max(5),
  comment: z.string().max(1000),
  media: evidenceSchema,
});
export function validateFiveS(
  questions: z.infer<typeof fiveSQuestion>[],
  responses: z.infer<typeof fiveSResponse>[],
) {
  if (
    responses.length !== questions.length ||
    new Set(responses.map((r) => r.questionId)).size !== questions.length ||
    questions.some(
      (q) =>
        !responses.some(
          (r) => r.questionId === q.id && (!q.photo || r.media.length > 0),
        ),
    )
  )
    throw Error("Answer each 5S question and attach required evidence");
  return {
    score: responses.reduce((sum, r) => sum + r.score, 0),
    maximum: questions.length * 5,
  };
}
export const defectSchema = z.object({
  equipmentId: z.string().uuid(),
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().min(1).max(10000),
  priority: z.enum(["Low", "Medium", "High", "Critical"]),
  media: evidenceSchema,
});
export const dashboardDepartmentSchema = z
  .object({
    plant: z.string().min(1).max(100),
    department: z.string().min(1).max(100),
  })
  .nullable();
