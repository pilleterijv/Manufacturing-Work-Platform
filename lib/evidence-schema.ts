import { z } from "zod";
export const mediaSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["photo", "video"]),
  caption: z.string().max(500).default(""),
});
export const evidenceSchema = z.array(mediaSchema).max(20);
export type Evidence = z.infer<typeof mediaSchema>;
