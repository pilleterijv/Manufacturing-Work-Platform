ALTER TABLE "User" ADD COLUMN email TEXT;
ALTER TABLE "Notification" ALTER COLUMN "ideaId" DROP NOT NULL;
ALTER TABLE "Notification" ADD COLUMN kind TEXT NOT NULL DEFAULT 'idea', ADD COLUMN "sourceId" TEXT;
CREATE TABLE "WorkSchedule" (
 id TEXT PRIMARY KEY, family TEXT NOT NULL, "equipmentId" TEXT NOT NULL REFERENCES "Equipment"(id), title TEXT NOT NULL,
 "assigneeIds" JSONB NOT NULL, "managerIds" JSONB NOT NULL, "shiftNames" JSONB NOT NULL, weekdays JSONB NOT NULL, config JSONB NOT NULL,
 "notifyInApp" BOOLEAN NOT NULL DEFAULT true, "notifyEmail" BOOLEAN NOT NULL DEFAULT true, active BOOLEAN NOT NULL DEFAULT true,
 "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "checkedThrough" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "createdBy" TEXT NOT NULL REFERENCES "User"(id), version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE "ShiftCheck" (
 id TEXT PRIMARY KEY, "scheduleId" TEXT NOT NULL REFERENCES "WorkSchedule"(id), "shiftStart" TIMESTAMP(3) NOT NULL,
 "shiftEnd" TIMESTAMP(3) NOT NULL, "shiftName" TEXT NOT NULL, "assigneeKey" TEXT NOT NULL,
 "completedRecordId" TEXT REFERENCES "Record"(id), "expectedStandardId" TEXT REFERENCES "Standard"(id), missed BOOLEAN NOT NULL, "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("scheduleId","shiftStart","assigneeKey")
);
CREATE TABLE "EmailDelivery" (
 id TEXT PRIMARY KEY, "scheduleId" TEXT NOT NULL REFERENCES "WorkSchedule"(id), "checkId" TEXT NOT NULL REFERENCES "ShiftCheck"(id),
 "userId" TEXT NOT NULL REFERENCES "User"(id), subject TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pending',
 attempts INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "claimedUntil" TIMESTAMP(3), "sentAt" TIMESTAMP(3), "lastError" TEXT,
 UNIQUE("checkId","userId")
);
CREATE INDEX "EmailDelivery_status_due" ON "EmailDelivery"(status,"nextAttemptAt");
CREATE TABLE "IntegrationSource" (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, "tokenHash" TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT true,
 "createdBy" TEXT NOT NULL REFERENCES "User"(id), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastReceivedAt" TIMESTAMP(3), "lastError" TEXT, "sqlCursor" TEXT NOT NULL DEFAULT '0'
);
CREATE TABLE "MachineBinding" (
 id TEXT PRIMARY KEY, "sourceId" TEXT NOT NULL REFERENCES "IntegrationSource"(id), "externalId" TEXT NOT NULL,
 "equipmentId" TEXT NOT NULL UNIQUE REFERENCES "Equipment"(id), "reasonId" TEXT NOT NULL REFERENCES "DowntimeReason"(id),
 active BOOLEAN NOT NULL DEFAULT true, "lastAt" TIMESTAMP(3), "lastState" TEXT, "activeDowntimeId" TEXT REFERENCES "Downtime"(id), UNIQUE("sourceId","externalId")
);
CREATE TABLE "IntegrationReceipt" (
 id TEXT PRIMARY KEY, "sourceId" TEXT NOT NULL REFERENCES "IntegrationSource"(id), "eventId" TEXT NOT NULL, "payloadHash" TEXT NOT NULL,
 "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "downtimeId" TEXT REFERENCES "Downtime"(id), outcome TEXT NOT NULL, UNIQUE("sourceId","eventId")
);
ALTER TABLE "Downtime" ADD COLUMN "externalSourceId" TEXT REFERENCES "IntegrationSource"(id), ADD COLUMN "externalSourceName" TEXT;
CREATE INDEX "Downtime_equipment_started_id" ON "Downtime"("equipmentId","startedAt" DESC,id DESC);
CREATE INDEX "Record_standard_created" ON "Record"("standardId",created,"userId") WHERE kind='run';
