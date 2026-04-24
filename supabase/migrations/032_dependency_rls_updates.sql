-- Update RLS policies to support Dependency Tasks for all users

-- 1. Allow users to see all profiles (needed to select assignees for dependencies)
DROP POLICY IF EXISTS "profiles_select_own" ON "Marketing-PM-Tool".profiles;
CREATE POLICY "profiles_select_all" ON "Marketing-PM-Tool".profiles
  FOR SELECT USING (true);

-- 2. Allow users to see tasks they assigned to others (dependencies)
DROP POLICY IF EXISTS "tasks_select" ON "Marketing-PM-Tool".tasks;
CREATE POLICY "tasks_select_own_or_assigned" ON "Marketing-PM-Tool".tasks
  FOR SELECT USING (
    user_id = auth.uid() OR 
    assigned_by = auth.uid() OR 
    "Marketing-PM-Tool".is_admin()
  );

-- 3. Allow users to update tasks they assigned (needed for dependency approval)
DROP POLICY IF EXISTS "tasks_update" ON "Marketing-PM-Tool".tasks;
CREATE POLICY "tasks_update_own_or_assigned" ON "Marketing-PM-Tool".tasks
  FOR UPDATE USING (
    user_id = auth.uid() OR 
    assigned_by = auth.uid() OR 
    "Marketing-PM-Tool".is_admin()
  );

-- 4. Allow users to see notifications they created? (Optional, usually notifications are just for the recipient)
-- Current policy: FOR SELECT USING (user_id = auth.uid()) is fine.
