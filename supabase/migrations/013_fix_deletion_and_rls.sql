-- Ensure service_role can bypass RLS for cleanup
-- Although service_role usually bypasses RLS, explicit policies can help in some environments

-- profiles
DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_delete_profiles" ON "Marketing-PM-Tool".profiles;
  CREATE POLICY "service_role_delete_profiles" ON "Marketing-PM-Tool".profiles FOR DELETE TO service_role USING (true);
EXCEPTION WHEN OTHERS THEN END $$;

-- tasks
DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_delete_tasks" ON "Marketing-PM-Tool".tasks;
  CREATE POLICY "service_role_delete_tasks" ON "Marketing-PM-Tool".tasks FOR DELETE TO service_role USING (true);
EXCEPTION WHEN OTHERS THEN END $$;

-- monthly_plans
DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_delete_plans" ON "Marketing-PM-Tool".monthly_plans;
  CREATE POLICY "service_role_delete_plans" ON "Marketing-PM-Tool".monthly_plans FOR DELETE TO service_role USING (true);
EXCEPTION WHEN OTHERS THEN END $$;

-- Ensure constraints are robust
ALTER TABLE "Marketing-PM-Tool".tasks
  DROP CONSTRAINT IF EXISTS tasks_approved_by_fkey,
  ADD CONSTRAINT tasks_approved_by_fkey
  FOREIGN KEY (approved_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;
