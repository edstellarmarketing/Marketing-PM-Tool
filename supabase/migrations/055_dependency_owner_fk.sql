-- Dependency Owner is now a reference to an existing profile rather than free text.
-- The text column is kept around so any legacy free-text values stay readable, but
-- new writes always use the FK.

ALTER TABLE "Marketing-PM-Tool".project_tasks
  ADD COLUMN dependency_owner_id uuid REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL;

CREATE INDEX ON "Marketing-PM-Tool".project_tasks (dependency_owner_id);
