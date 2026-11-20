ALTER TABLE "Problem" ADD COLUMN "participantIds" JSONB NOT NULL DEFAULT '[]';
CREATE INDEX "Problem_participantIds_idx" ON "Problem" USING GIN ("participantIds");
