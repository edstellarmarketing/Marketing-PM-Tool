-- Track which admin assigned a task to a user.
-- When set, the task was created by an admin on behalf of the user and
-- the user should not be able to delete it.
ALTER TABLE "Marketing-PM-Tool".tasks
  ADD COLUMN IF NOT EXISTS assigned_by uuid
    REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by
  ON "Marketing-PM-Tool".tasks(assigned_by)
  WHERE assigned_by IS NOT NULL;

-- Tighten the delete policy: the task owner can delete only their own,
-- self-created tasks. Admin-assigned tasks (assigned_by IS NOT NULL) must go
-- through the admin client (service_role) which already bypasses this policy
-- via the "service_role_delete_tasks" policy from migration 013.
DROP POLICY IF EXISTS "tasks_delete" ON "Marketing-PM-Tool".tasks;
CREATE POLICY "tasks_delete" ON "Marketing-PM-Tool".tasks
  FOR DELETE USING (user_id = auth.uid() AND assigned_by IS NULL);
