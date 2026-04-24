-- Enable RLS on all tables
ALTER TABLE "Marketing-PM-Tool".profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".monthly_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".task_updates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".monthly_scores     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".appraisal_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".notifications      ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user an admin?
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Marketing-PM-Tool".profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- profiles
CREATE POLICY "profiles_select_own" ON "Marketing-PM-Tool".profiles
  FOR SELECT USING (id = auth.uid() OR "Marketing-PM-Tool".is_admin());

CREATE POLICY "profiles_update_own" ON "Marketing-PM-Tool".profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "profiles_insert_own" ON "Marketing-PM-Tool".profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- monthly_plans
CREATE POLICY "plans_select" ON "Marketing-PM-Tool".monthly_plans
  FOR SELECT USING (user_id = auth.uid() OR "Marketing-PM-Tool".is_admin());

CREATE POLICY "plans_insert" ON "Marketing-PM-Tool".monthly_plans
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "plans_update" ON "Marketing-PM-Tool".monthly_plans
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "plans_delete" ON "Marketing-PM-Tool".monthly_plans
  FOR DELETE USING (user_id = auth.uid());

-- tasks
CREATE POLICY "tasks_select" ON "Marketing-PM-Tool".tasks
  FOR SELECT USING (user_id = auth.uid() OR "Marketing-PM-Tool".is_admin());

CREATE POLICY "tasks_insert" ON "Marketing-PM-Tool".tasks
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "tasks_update" ON "Marketing-PM-Tool".tasks
  FOR UPDATE USING (user_id = auth.uid() OR "Marketing-PM-Tool".is_admin());

CREATE POLICY "tasks_delete" ON "Marketing-PM-Tool".tasks
  FOR DELETE USING (user_id = auth.uid());

-- task_updates
CREATE POLICY "task_updates_select" ON "Marketing-PM-Tool".task_updates
  FOR SELECT USING (user_id = auth.uid() OR "Marketing-PM-Tool".is_admin());

CREATE POLICY "task_updates_insert" ON "Marketing-PM-Tool".task_updates
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- monthly_scores
CREATE POLICY "scores_select" ON "Marketing-PM-Tool".monthly_scores
  FOR SELECT USING (user_id = auth.uid() OR "Marketing-PM-Tool".is_admin());

CREATE POLICY "scores_insert_admin" ON "Marketing-PM-Tool".monthly_scores
  FOR INSERT WITH CHECK ("Marketing-PM-Tool".is_admin());

CREATE POLICY "scores_update_admin" ON "Marketing-PM-Tool".monthly_scores
  FOR UPDATE USING ("Marketing-PM-Tool".is_admin());

-- appraisal_snapshots
CREATE POLICY "appraisals_select" ON "Marketing-PM-Tool".appraisal_snapshots
  FOR SELECT USING (user_id = auth.uid() OR "Marketing-PM-Tool".is_admin());

CREATE POLICY "appraisals_write_admin" ON "Marketing-PM-Tool".appraisal_snapshots
  FOR ALL USING ("Marketing-PM-Tool".is_admin());

-- notifications
CREATE POLICY "notifications_select" ON "Marketing-PM-Tool".notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notifications_update" ON "Marketing-PM-Tool".notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "notifications_insert_admin" ON "Marketing-PM-Tool".notifications
  FOR INSERT WITH CHECK ("Marketing-PM-Tool".is_admin());
