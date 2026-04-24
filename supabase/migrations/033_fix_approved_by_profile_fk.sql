-- Recreate tasks_approved_by_fkey to reference profiles instead of auth.users
-- so PostgREST can join reviewer profile data in the approval history query.
ALTER TABLE "Marketing-PM-Tool".tasks
  DROP CONSTRAINT IF EXISTS tasks_approved_by_fkey;

ALTER TABLE "Marketing-PM-Tool".tasks
  ADD CONSTRAINT tasks_approved_by_fkey
  FOREIGN KEY (approved_by)
  REFERENCES "Marketing-PM-Tool".profiles(id)
  ON DELETE SET NULL;
