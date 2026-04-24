-- Explicit flag that prevents non-admin users from changing task_type / complexity.
-- Replaces the fragile assigned_by IS NOT NULL check with a dedicated, backfillable column.
ALTER TABLE "Marketing-PM-Tool".tasks
  ADD COLUMN IF NOT EXISTS scoring_locked boolean NOT NULL DEFAULT false;

-- Backfill: lock scoring on all tasks that were already tagged with an assigner.
UPDATE "Marketing-PM-Tool".tasks
  SET scoring_locked = true
  WHERE assigned_by IS NOT NULL;
