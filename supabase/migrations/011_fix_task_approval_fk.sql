ALTER TABLE "Marketing-PM-Tool".tasks
  DROP CONSTRAINT IF EXISTS tasks_approved_by_fkey;

ALTER TABLE "Marketing-PM-Tool".tasks
  ADD CONSTRAINT tasks_approved_by_fkey
  FOREIGN KEY (approved_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;
