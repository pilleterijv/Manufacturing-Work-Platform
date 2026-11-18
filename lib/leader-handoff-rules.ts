import { z } from "zod";
export const handoffChoice = z.enum(["", "Yes", "No", "Not applicable"]);
export const leaderHandoffSchema = z.object({
  shift: z.string().max(100),
  notes: z.string().max(10000),
  rooms: z
    .array(
      z.object({
        room: z.string().max(100),
        item: z.string().max(100),
        lot: z.string().max(100),
        targetSpeed: z.string().max(40),
        actualSpeed: z.string().max(40),
        remaining: z.string().max(150),
        issues: z.string().max(2000),
        nextOrder: handoffChoice,
        status: z.string().max(150).optional(),
        materialsSplit: handoffChoice.optional(),
        weighsLeft: z.string().max(40).optional(),
        cleanBins: z.string().max(40).optional(),
        inspectingFor: z.string().max(500).optional(),
        requiresYielding: handoffChoice.optional(),
        yielded: handoffChoice.optional(),
        round: z.string().max(40).optional(),
        totalRounds: z.string().max(40).optional(),
        solutionMixed: handoffChoice.optional(),
        nextSolutionReady: handoffChoice.optional(),
        lastFourRecalculated: handoffChoice.optional(),
      }),
    )
    .max(30),
});
export type LeaderHandoffData = z.infer<typeof leaderHandoffSchema>;
