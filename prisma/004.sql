ALTER TABLE "Idea" ADD COLUMN process TEXT NOT NULL DEFAULT '';
CREATE INDEX "Record_user_kind_created_id" ON "Record" ("userId", kind, created DESC, id DESC);
CREATE INDEX "Downtime_started_id" ON "Downtime" ("startedAt" DESC, id DESC);
CREATE INDEX "Downtime_department_started_id" ON "Downtime" (("equipmentSnapshot"->>'department'), "startedAt" DESC, id DESC);
CREATE INDEX "Idea_created_id" ON "Idea" ("createdAt" DESC, id DESC);
CREATE INDEX "Idea_department_created_id" ON "Idea" (("equipmentSnapshot"->>'department'), "createdAt" DESC, id DESC);
-- A distinct aggregate-report permission; no account or raw-record access.
UPDATE "Policy" SET grants = grants || '["dashboard"]'::jsonb
 WHERE jsonb_typeof(grants) = 'array' AND NOT grants @> '["dashboard"]'::jsonb;
