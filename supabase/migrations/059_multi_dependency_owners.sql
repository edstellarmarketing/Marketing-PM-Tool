-- A project task can now block on multiple dependency owners. We add an array
-- column and backfill it from the existing single-owner column. The single
-- column is kept around so older code paths keep working until they migrate.

ALTER TABLE "Marketing-PM-Tool".project_tasks
  ADD COLUMN dependency_owner_ids uuid[];

UPDATE "Marketing-PM-Tool".project_tasks
  SET dependency_owner_ids = ARRAY[dependency_owner_id]
  WHERE dependency_owner_id IS NOT NULL
    AND dependency_owner_ids IS NULL;

CREATE INDEX IF NOT EXISTS project_tasks_dependency_owner_ids_idx
  ON "Marketing-PM-Tool".project_tasks USING GIN (dependency_owner_ids);
