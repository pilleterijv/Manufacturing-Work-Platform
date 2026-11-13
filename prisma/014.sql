CREATE TABLE "Centerline" (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 "equipmentId" TEXT NOT NULL REFERENCES "Equipment"(id),
 setup TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '',
 parameters JSONB NOT NULL,
 active BOOLEAN NOT NULL DEFAULT true,
 version INTEGER NOT NULL DEFAULT 1,
 history JSONB NOT NULL DEFAULT '[]',
 "createdBy" TEXT NOT NULL REFERENCES "User"(id),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Centerline_equipmentId_active_idx" ON "Centerline" ("equipmentId",active);
CREATE INDEX "Record_centerline_equipment_created_idx" ON "Record" ((data->>'equipmentId'),created DESC,id DESC) WHERE kind='centerline';
-- Enable the new section for roles that already have permission to perform machine work.
-- Preserve customized role policies that withhold that permission.
UPDATE "Policy" SET grants=grants || '["centerlines"]'::jsonb
WHERE grants ? 'work' AND NOT grants ? 'centerlines';
