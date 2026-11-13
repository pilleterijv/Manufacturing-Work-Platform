CREATE TABLE "SubmissionReceipt" (id TEXT PRIMARY KEY,"userId" TEXT NOT NULL,kind TEXT NOT NULL,digest TEXT NOT NULL,result JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "SubmissionReceipt_userId_idx" ON "SubmissionReceipt" ("userId");
