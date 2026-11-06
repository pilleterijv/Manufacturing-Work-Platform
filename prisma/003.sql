CREATE INDEX "Record_created_id" ON "Record" (created,id);
CREATE INDEX "Record_kind_created" ON "Record" (kind,created);
CREATE INDEX "Session_expires" ON "Session" (expires);
CREATE INDEX "Rate_expires" ON "Rate" (expires);
CREATE INDEX "Idea_department" ON "Idea" (("equipmentSnapshot"->>'department'));
