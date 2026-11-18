ALTER TABLE "Standard" ADD COLUMN "handoffProfile" TEXT NOT NULL DEFAULT 'generic';
ALTER TABLE "Standard" ADD CONSTRAINT "Standard_handoffProfile_check" CHECK ("handoffProfile" IN ('generic','compressing','blending','weigh-room','coating'));
