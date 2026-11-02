-- Exact response-photo authorization without fetching all historical JSON.
CREATE INDEX "Record_response_photos" ON "Record" USING GIN ((data->'responses') jsonb_path_ops) WHERE kind IN ('run','audit');
