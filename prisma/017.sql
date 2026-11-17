ALTER TABLE "Policy" ADD COLUMN "homeProfile" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_homeProfile_check" CHECK ("homeProfile" IN ('auto','operator','leader','supervisor','maintenance','manager'));
