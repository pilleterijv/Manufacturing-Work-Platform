ALTER TABLE "Standard" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Standard" ADD COLUMN "workflow" TEXT NOT NULL DEFAULT 'process' CHECK ("workflow" IN ('process','leader'));
CREATE INDEX "Standard_active_workflow" ON "Standard" ("workflow","archived");
