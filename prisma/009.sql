-- Shared location catalog and workspace-wide assignments. No historical records are rewritten.
CREATE TABLE "Location" (id TEXT PRIMARY KEY, plant TEXT NOT NULL, department TEXT NOT NULL, area TEXT NOT NULL DEFAULT '', line TEXT NOT NULL DEFAULT '', active BOOLEAN NOT NULL DEFAULT true, UNIQUE(plant,department,area,line));
INSERT INTO "Location" SELECT gen_random_uuid()::text,plant,department,area,line,true FROM (SELECT DISTINCT ON (lower(btrim(plant)),lower(btrim(department)),lower(btrim(area)),lower(btrim(line))) plant,department,area,line FROM "Equipment" ORDER BY lower(btrim(plant)),lower(btrim(department)),lower(btrim(area)),lower(btrim(line)),id) e;
CREATE UNIQUE INDEX "Location_canonical" ON "Location" (lower(btrim(plant)),lower(btrim(department)),lower(btrim(area)),lower(btrim(line)));
ALTER TABLE "User" ADD COLUMN "workspaceAccess" JSONB NOT NULL DEFAULT '{"mode":"restricted","locations":[],"equipmentIds":[]}';
UPDATE "User" SET "workspaceAccess"="downtimeAccess" WHERE "downtimeAccess"->>'mode'='restricted';
UPDATE "User" SET "workspaceAccess"='{"mode":"all","locations":[],"equipmentIds":[]}' WHERE role='Admin';
ALTER TABLE "Standard" ADD COLUMN kind TEXT NOT NULL DEFAULT 'run', ADD COLUMN "assigneeIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Content" ADD COLUMN media JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Problem" ADD COLUMN requirements JSONB;
ALTER TABLE "ProblemAction" ADD COLUMN required BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WorkSchedule" ADD COLUMN kind TEXT NOT NULL DEFAULT 'run';
CREATE TABLE "GuideMedia" (id TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"(id), mime TEXT NOT NULL, bytes INTEGER NOT NULL, created TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
