-- 068: user-defined task groups (sections/phases) within a project.
--
-- A project owns an ordered, flat list of named groups that the creator defines
-- (typically at project creation, e.g. "Pre-Launch", "Launch Day", "Post-Launch").
-- Each task optionally belongs to one group; ungrouped tasks fall into an implicit
-- "Ungrouped" bucket in the UI.
--
-- This is orthogonal to project_owners (departments): a task has both an owner
-- (department) and, optionally, a group. Deleting a group keeps its tasks and just
-- clears their group_id (ON DELETE SET NULL).

CREATE TABLE "Marketing-PM-Tool".project_task_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES "Marketing-PM-Tool".projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER project_task_groups_updated_at
  BEFORE UPDATE ON "Marketing-PM-Tool".project_task_groups
  FOR EACH ROW EXECUTE FUNCTION "Marketing-PM-Tool".set_updated_at();

CREATE INDEX ON "Marketing-PM-Tool".project_task_groups (project_id);
CREATE INDEX ON "Marketing-PM-Tool".project_task_groups (project_id, sort_order);

-- Tasks reference a group; clearing a deleted group leaves the task ungrouped.
ALTER TABLE "Marketing-PM-Tool".project_tasks
  ADD COLUMN group_id uuid REFERENCES "Marketing-PM-Tool".project_task_groups(id) ON DELETE SET NULL;

CREATE INDEX ON "Marketing-PM-Tool".project_tasks (group_id);

ALTER TABLE "Marketing-PM-Tool".project_task_groups ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read; project creator or admin can write.
-- (Mirrors project_owners, migration 051. Team-lead creators are additionally
-- authorized at the route-handler layer via the service-role client.)
CREATE POLICY "project_task_groups_select_all" ON "Marketing-PM-Tool".project_task_groups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "project_task_groups_write" ON "Marketing-PM-Tool".project_task_groups
  FOR ALL TO authenticated
  USING (
    "Marketing-PM-Tool".is_admin()
    OR EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".projects p
      WHERE p.id = project_id AND p.created_by = auth.uid()
    )
  )
  WITH CHECK (
    "Marketing-PM-Tool".is_admin()
    OR EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".projects p
      WHERE p.id = project_id AND p.created_by = auth.uid()
    )
  );
