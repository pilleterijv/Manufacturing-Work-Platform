ALTER TABLE "User" ADD COLUMN "overdueInApp" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "overdueEmail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Content" ADD COLUMN "createdBy" TEXT REFERENCES "User"(id), ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE "MaintenancePlan" (id TEXT PRIMARY KEY,"equipmentId" TEXT NOT NULL REFERENCES "Equipment"(id),title TEXT NOT NULL,steps JSONB NOT NULL,"assigneeId" TEXT NOT NULL REFERENCES "User"(id),"intervalDays" INTEGER NOT NULL CHECK("intervalDays">0),"nextDue" TEXT NOT NULL,active BOOLEAN NOT NULL DEFAULT true,version INTEGER NOT NULL DEFAULT 1,"createdBy" TEXT NOT NULL REFERENCES "User"(id),history JSONB NOT NULL);
CREATE TABLE "Reminder" (id TEXT PRIMARY KEY,"dedupeKey" TEXT NOT NULL UNIQUE,"entityType" TEXT NOT NULL,"entityId" TEXT NOT NULL,"equipmentId" TEXT NOT NULL REFERENCES "Equipment"(id),"userId" TEXT NOT NULL REFERENCES "User"(id),subject TEXT NOT NULL,message TEXT NOT NULL,email BOOLEAN NOT NULL,status TEXT NOT NULL DEFAULT 'Pending',attempts INTEGER NOT NULL DEFAULT 0,"nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"claimedUntil" TIMESTAMP(3),"sentAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"lastError" TEXT);
CREATE INDEX "Reminder_delivery" ON "Reminder" (status,"nextAttemptAt");
CREATE TABLE "ExternalFeed" (id TEXT PRIMARY KEY,"sourceId" TEXT NOT NULL REFERENCES "IntegrationSource"(id),name TEXT NOT NULL,section TEXT NOT NULL,active BOOLEAN NOT NULL DEFAULT true,cursor TEXT NOT NULL DEFAULT '0',"lastImportedAt" TIMESTAMP(3),"lastError" TEXT);
CREATE TABLE "ExternalRow" (id TEXT PRIMARY KEY,"feedId" TEXT NOT NULL REFERENCES "ExternalFeed"(id),"externalId" TEXT NOT NULL,"equipmentId" TEXT NOT NULL REFERENCES "Equipment"(id),"personId" TEXT REFERENCES "User"(id),title TEXT NOT NULL,details TEXT NOT NULL,"occurredAt" TIMESTAMP(3) NOT NULL,"values" JSONB NOT NULL,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE("feedId","externalId"));
CREATE INDEX "ExternalRow_scope" ON "ExternalRow" ("equipmentId","occurredAt");
UPDATE "Policy" SET grants=grants || '["maintenance"]'::jsonb WHERE role IN ('Manager','DL/TL','Operator') AND NOT grants @> '["maintenance"]'::jsonb;

ALTER TABLE "Problem" ADD COLUMN media JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ProblemAction" ADD COLUMN media JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Idea" ADD COLUMN media JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ExternalFeed" ADD COLUMN mode TEXT NOT NULL DEFAULT 'api' CHECK (mode IN ('api','excel'));
CREATE TABLE "ExternalRevision" (id TEXT PRIMARY KEY,"rowId" TEXT NOT NULL REFERENCES "ExternalRow"(id),snapshot JSONB NOT NULL,"importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
