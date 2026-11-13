import { z } from "zod";
const number = z.number().finite().min(-1e12).max(1e12);
export const centerlineParameterSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(150),
    kind: z.enum(["numeric", "text"]),
    unit: z.string().trim().max(40),
    target: number.nullable(),
    lower: number.nullable(),
    upper: number.nullable(),
    expected: z.string().trim().max(150),
    instructions: z.string().trim().max(1000),
    photo: z.boolean(),
  })
  .superRefine((p, ctx) => {
    if (
      p.kind === "numeric" &&
      (p.target === null ||
        p.lower === null ||
        p.upper === null ||
        p.lower > p.target ||
        p.target > p.upper)
    )
      ctx.addIssue({
        code: "custom",
        message: "Numeric settings need lower ≤ target ≤ upper limits",
      });
    if (p.kind === "text" && !p.expected)
      ctx.addIssue({
        code: "custom",
        message: "Text settings need an expected value",
      });
  });
export const centerlineSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    equipmentId: z.string().uuid(),
    setup: z.string().trim().max(150),
    notes: z.string().trim().max(3000),
    parameters: z.array(centerlineParameterSchema).min(1).max(100),
  })
  .superRefine((p, ctx) => {
    if (
      new Set(p.parameters.map((x) => x.id)).size !== p.parameters.length ||
      new Set(p.parameters.map((x) => x.name.toLowerCase())).size !==
        p.parameters.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Setting IDs and names must be unique within a centerline",
      });
  });
export type CenterlineParameter = z.infer<typeof centerlineParameterSchema>;
export function readingResult(p: CenterlineParameter, actual: string) {
  const value = actual.trim();
  if (!value) throw Error("Enter an actual reading for every setting");
  if (p.kind === "text")
    return {
      value,
      withinLimits: value.toLowerCase() === p.expected.trim().toLowerCase(),
    };
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value))
    throw Error("Enter a finite numeric reading");
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > 1e12)
    throw Error("Numeric readings must be between -1e12 and 1e12");
  return { value: n, withinLimits: n >= p.lower! && n <= p.upper! };
}
