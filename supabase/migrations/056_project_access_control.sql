-- Tighten project access:
--  * Only admins create / delete / edit projects.
--  * Only admins manage project owners and supporting members.
--  * Members see + create + edit (not delete) tasks of projects where they
--    are a project_owner.user_id OR project_owner_members.user_id.

CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".is_project_participant(p_project_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Marketing-PM-Tool".project_owners o
    WHERE o.project_id = p_project_id AND o.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM "Marketing-PM-Tool".project_owner_members m
    JOIN "Marketing-PM-Tool".project_owners o ON o.id = m.owner_id
    WHERE o.project_id = p_project_id AND m.user_id = auth.uid()
  );
$$;

-- ============================================================
-- projects
-- ============================================================
DROP POLICY IF EXISTS "projects_select_all"            ON "Marketing-PM-Tool".projects;
DROP POLICY IF EXISTS "projects_insert_auth"           ON "Marketing-PM-Tool".projects;
DROP POLICY IF EXISTS "projects_update_owner_or_admin" ON "Marketing-PM-Tool".projects;
DROP POLICY IF EXISTS "projects_delete_owner_or_admin" ON "Marketing-PM-Tool".projects;

CREATE POLICY "projects_select" ON "Marketing-PM-Tool".projects
  FOR SELECT TO authenticated
  USING (
    "Marketing-PM-Tool".is_admin()
    OR created_by = auth.uid()
    OR "Marketing-PM-Tool".is_project_participant(id)
  );

CREATE POLICY "projects_insert_admin" ON "Marketing-PM-Tool".projects
  FOR INSERT TO authenticated
  WITH CHECK ("Marketing-PM-Tool".is_admin() AND created_by = auth.uid());

CREATE POLICY "projects_update_admin" ON "Marketing-PM-Tool".projects
  FOR UPDATE TO authenticated
  USING ("Marketing-PM-Tool".is_admin())
  WITH CHECK ("Marketing-PM-Tool".is_admin());

CREATE POLICY "projects_delete_admin" ON "Marketing-PM-Tool".projects
  FOR DELETE TO authenticated
  USING ("Marketing-PM-Tool".is_admin());

-- ============================================================
-- project_tasks
-- ============================================================
DROP POLICY IF EXISTS "project_tasks_select_all"  ON "Marketing-PM-Tool".project_tasks;
DROP POLICY IF EXISTS "project_tasks_insert_auth" ON "Marketing-PM-Tool".project_tasks;
DROP POLICY IF EXISTS "project_tasks_update"      ON "Marketing-PM-Tool".project_tasks;
DROP POLICY IF EXISTS "project_tasks_delete"      ON "Marketing-PM-Tool".project_tasks;

CREATE POLICY "project_tasks_select" ON "Marketing-PM-Tool".project_tasks
  FOR SELECT TO authenticated
  USING (
    "Marketing-PM-Tool".is_admin()
    OR "Marketing-PM-Tool".is_project_participant(project_id)
  );

CREATE POLICY "project_tasks_insert" ON "Marketing-PM-Tool".project_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      "Marketing-PM-Tool".is_admin()
      OR "Marketing-PM-Tool".is_project_participant(project_id)
    )
  );

CREATE POLICY "project_tasks_update" ON "Marketing-PM-Tool".project_tasks
  FOR UPDATE TO authenticated
  USING (
    "Marketing-PM-Tool".is_admin()
    OR "Marketing-PM-Tool".is_project_participant(project_id)
  )
  WITH CHECK (
    "Marketing-PM-Tool".is_admin()
    OR "Marketing-PM-Tool".is_project_participant(project_id)
  );

CREATE POLICY "project_tasks_delete_admin" ON "Marketing-PM-Tool".project_tasks
  FOR DELETE TO authenticated
  USING ("Marketing-PM-Tool".is_admin());

-- ============================================================
-- project_owners (writes admin-only; select for participants)
-- ============================================================
DROP POLICY IF EXISTS "project_owners_select_all" ON "Marketing-PM-Tool".project_owners;
DROP POLICY IF EXISTS "project_owners_write"      ON "Marketing-PM-Tool".project_owners;

CREATE POLICY "project_owners_select" ON "Marketing-PM-Tool".project_owners
  FOR SELECT TO authenticated
  USING (
    "Marketing-PM-Tool".is_admin()
    OR user_id = auth.uid()
    OR "Marketing-PM-Tool".is_project_participant(project_id)
  );

CREATE POLICY "project_owners_write_admin" ON "Marketing-PM-Tool".project_owners
  FOR ALL TO authenticated
  USING ("Marketing-PM-Tool".is_admin())
  WITH CHECK ("Marketing-PM-Tool".is_admin());

-- ============================================================
-- project_owner_members (writes admin-only; select for participants)
-- ============================================================
DROP POLICY IF EXISTS "project_owner_members_select_all" ON "Marketing-PM-Tool".project_owner_members;
DROP POLICY IF EXISTS "project_owner_members_write"      ON "Marketing-PM-Tool".project_owner_members;

CREATE POLICY "project_owner_members_select" ON "Marketing-PM-Tool".project_owner_members
  FOR SELECT TO authenticated
  USING (
    "Marketing-PM-Tool".is_admin()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM "Marketing-PM-Tool".project_owners po
      WHERE po.id = owner_id
        AND "Marketing-PM-Tool".is_project_participant(po.project_id)
    )
  );

CREATE POLICY "project_owner_members_write_admin" ON "Marketing-PM-Tool".project_owner_members
  FOR ALL TO authenticated
  USING ("Marketing-PM-Tool".is_admin())
  WITH CHECK ("Marketing-PM-Tool".is_admin());
