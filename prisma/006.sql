CREATE TABLE "Problem" (
 id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, method TEXT NOT NULL CHECK (method IN ('2D','4D','8D')),
 title TEXT NOT NULL, "equipmentId" TEXT NOT NULL REFERENCES "Equipment"(id), "equipmentSnapshot" JSONB NOT NULL,
 "occurredOn" TEXT NOT NULL, "reportedBy" TEXT NOT NULL, "ownerId" TEXT NOT NULL REFERENCES "User"(id),
 "reviewerId" TEXT NOT NULL REFERENCES "User"(id), team TEXT NOT NULL, "dueDate" TEXT NOT NULL,
 "previousId" TEXT REFERENCES "Problem"(id), answers JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','In progress','Verification','Closed')),
 "createdBy" TEXT NOT NULL REFERENCES "User"(id), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "closedAt" TIMESTAMP(3), version INTEGER NOT NULL DEFAULT 1, history JSONB NOT NULL
);
CREATE INDEX "Problem_createdAt_id_idx" ON "Problem"("createdAt",id);
CREATE INDEX "Problem_status_dueDate_idx" ON "Problem"(status,"dueDate");
CREATE TABLE "ProblemAction" (
 id TEXT PRIMARY KEY, "problemId" TEXT NOT NULL REFERENCES "Problem"(id), type TEXT NOT NULL,
 title TEXT NOT NULL, checkpoint TEXT NOT NULL DEFAULT '', "ownerId" TEXT NOT NULL REFERENCES "User"(id), "dueDate" TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','In progress','Completed')), comment TEXT NOT NULL DEFAULT '',
 "completedAt" TIMESTAMP(3), version INTEGER NOT NULL DEFAULT 1, history JSONB NOT NULL
);
CREATE INDEX "ProblemAction_problemId_idx" ON "ProblemAction"("problemId");
CREATE INDEX "ProblemAction_status_dueDate_idx" ON "ProblemAction"(status,"dueDate");
UPDATE "Policy" SET grants = grants || '["problems"]'::jsonb
 WHERE jsonb_typeof(grants)='array' AND NOT grants @> '["problems"]'::jsonb;
