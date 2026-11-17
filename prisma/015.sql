ALTER TABLE "Policy" ADD COLUMN "baseRole" TEXT NOT NULL DEFAULT 'Operator', ADD COLUMN "adminPrivileges" JSONB NOT NULL DEFAULT '[]', ADD COLUMN description TEXT NOT NULL DEFAULT '', ADD COLUMN active BOOLEAN NOT NULL DEFAULT true, ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
UPDATE "Policy" SET "baseRole"=role WHERE role IN ('Admin','Manager','DL/TL','Operator');
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_baseRole_check" CHECK ("baseRole" IN ('Admin','Manager','DL/TL','Operator') AND ("baseRole"<>'Admin' OR role='Admin'));
CREATE UNIQUE INDEX "Policy_role_case_insensitive" ON "Policy" (lower(role));
ALTER TABLE "User" ADD COLUMN "customRole" TEXT REFERENCES "Policy"(role);
ALTER TABLE "User" ADD CONSTRAINT "User_role_assignment_check" CHECK (role IN ('Admin','Manager','DL/TL','Operator') AND ("customRole" IS NULL OR role<>'Admin'));
CREATE INDEX "User_customRole_idx" ON "User" ("customRole");
CREATE TABLE "RoleAudit" (id TEXT PRIMARY KEY,"actorId" TEXT NOT NULL REFERENCES "User"(id),role TEXT NOT NULL,action TEXT NOT NULL,snapshot JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "RoleAudit_role_createdAt_idx" ON "RoleAudit" (role,"createdAt");
