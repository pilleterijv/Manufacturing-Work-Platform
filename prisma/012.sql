ALTER TABLE "User" ADD COLUMN "dashboardPreferences" JSONB NOT NULL DEFAULT '{}', ADD COLUMN "extraGrants" JSONB NOT NULL DEFAULT '[]', ADD COLUMN "adminPrivileges" JSONB NOT NULL DEFAULT '[]';
CREATE TABLE "AccountAudit" (id TEXT PRIMARY KEY,"actorId" TEXT NOT NULL REFERENCES "User"(id),"targetId" TEXT NOT NULL REFERENCES "User"(id),action TEXT NOT NULL,data JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "AccountAudit_targetId_createdAt_idx" ON "AccountAudit" ("targetId","createdAt");
