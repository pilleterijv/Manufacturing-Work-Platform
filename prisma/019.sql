ALTER TABLE "WorkSchedule" ADD COLUMN "crewNames" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Standard" DROP CONSTRAINT "Standard_workflow_check";
ALTER TABLE "Standard" ADD CONSTRAINT "Standard_workflow_check" CHECK (workflow IN ('process','leader','changeover'));
