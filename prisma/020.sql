ALTER TABLE "User" ADD COLUMN "firstName" TEXT NOT NULL DEFAULT '', ADD COLUMN "lastName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "RegistrationRequest" ADD COLUMN "firstName" TEXT NOT NULL DEFAULT '', ADD COLUMN "lastName" TEXT NOT NULL DEFAULT '';
UPDATE "User" SET "firstName"=split_part(trim(name),' ',1), "lastName"=trim(substr(trim(name),length(split_part(trim(name),' ',1))+1));
UPDATE "RegistrationRequest" SET "firstName"=split_part(trim(name),' ',1), "lastName"=trim(substr(trim(name),length(split_part(trim(name),' ',1))+1));
CREATE TABLE "AssignmentDelivery" (
 id TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "entityType" TEXT NOT NULL,
 "entityId" TEXT NOT NULL, "equipmentId" TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Pending',
 attempts INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "claimedUntil" TIMESTAMP(3), "sentAt" TIMESTAMP(3), "lastError" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AssignmentDelivery_status_nextAttemptAt_idx" ON "AssignmentDelivery"(status,"nextAttemptAt");
CREATE INDEX "AssignmentDelivery_userId_idx" ON "AssignmentDelivery"("userId");
