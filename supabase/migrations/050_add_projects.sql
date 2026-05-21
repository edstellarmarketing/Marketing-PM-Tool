-- Projects + project tasks (isolated from the existing tasks table)

CREATE TYPE "Marketing-PM-Tool".project_status AS ENUM ('active', 'on_hold', 'completed', 'archived');
CREATE TYPE "Marketing-PM-Tool".project_task_status AS ENUM ('pending', 'in_progress', 'completed');

CREATE TABLE "Marketing-PM-Tool".projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  start_date  date,
  end_date    date,
  status      "Marketing-PM-Tool".project_status NOT NULL DEFAULT 'active',
  color       text,
  created_by  uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON "Marketing-PM-Tool".projects
  FOR EACH ROW EXECUTE FUNCTION "Marketing-PM-Tool".set_updated_at();

CREATE TABLE "Marketing-PM-Tool".project_tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES "Marketing-PM-Tool".projects(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  category    text,
  priority    "Marketing-PM-Tool".task_priority NOT NULL DEFAULT 'medium',
  status      "Marketing-PM-Tool".project_task_status NOT NULL DEFAULT 'pending',
  progress    int NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  assignee_id uuid REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL,
  due_date    date,
  created_by  uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER project_tasks_updated_at
  BEFORE UPDATE ON "Marketing-PM-Tool".project_tasks
  FOR EACH ROW EXECUTE FUNCTION "Marketing-PM-Tool".set_updated_at();

CREATE INDEX ON "Marketing-PM-Tool".project_tasks (project_id);
CREATE INDEX ON "Marketing-PM-Tool".project_tasks (assignee_id);
CREATE INDEX ON "Marketing-PM-Tool".project_tasks (project_id, status);

-- RLS: everyone authenticated can read projects + their tasks; admins manage; assignees can update their own tasks
ALTER TABLE "Marketing-PM-Tool".projects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".project_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_select_all" ON "Marketing-PM-Tool".projects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "projects_insert_auth" ON "Marketing-PM-Tool".projects
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "projects_update_owner_or_admin" ON "Marketing-PM-Tool".projects
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR "Marketing-PM-Tool".is_admin())
  WITH CHECK (created_by = auth.uid() OR "Marketing-PM-Tool".is_admin());

CREATE POLICY "projects_delete_owner_or_admin" ON "Marketing-PM-Tool".projects
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR "Marketing-PM-Tool".is_admin());

CREATE POLICY "project_tasks_select_all" ON "Marketing-PM-Tool".project_tasks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "project_tasks_insert_auth" ON "Marketing-PM-Tool".project_tasks
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "project_tasks_update" ON "Marketing-PM-Tool".project_tasks
  FOR UPDATE TO authenticated
  USING (
    assignee_id = auth.uid()
    OR created_by = auth.uid()
    OR "Marketing-PM-Tool".is_admin()
  )
  WITH CHECK (
    assignee_id = auth.uid()
    OR created_by = auth.uid()
    OR "Marketing-PM-Tool".is_admin()
  );

CREATE POLICY "project_tasks_delete" ON "Marketing-PM-Tool".project_tasks
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR "Marketing-PM-Tool".is_admin());
