-- Preserve existing access; administrators can then assign restricted scopes.
ALTER TABLE "User" ADD COLUMN "downtimeAccess" JSONB NOT NULL DEFAULT '{"mode":"all","locations":[],"equipmentIds":[]}'::jsonb;
