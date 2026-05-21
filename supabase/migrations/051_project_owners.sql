-- Project owners (each tied to a department) and their supporting member pool.
-- Tasks belong to an owner; the owner's department drives the dashboard tabs.

CREATE TABLE "Marketing-PM-Tool".project_owners (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES "Marketing-PM-Tool".projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  department  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id, department)
);

CREATE INDEX ON "Marketing-PM-Tool".project_owners (project_id);

CREATE TABLE "Marketing-PM-Tool".project_owner_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES "Marketing-PM-Tool".project_owners(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, user_id)
);

CREATE INDEX ON "Marketing-PM-Tool".project_owner_members (owner_id);

ALTER TABLE "Marketing-PM-Tool".project_tasks
  ADD COLUMN owner_id uuid REFERENCES "Marketing-PM-Tool".project_owners(id) ON DELETE SET NULL;

CREATE INDEX ON "Marketing-PM-Tool".project_tasks (owner_id);

ALTER TABLE "Marketing-PM-Tool".project_owners        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".project_owner_members ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read; project creator/owner or admin can write.
CREATE POLICY "project_owners_select_all" ON "Marketing-PM-Tool".project_owners
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "project_owners_write" ON "Marketing-PM-Tool".project_owners
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

CREATE POLICY "project_owner_members_select_all" ON "Marketing-PM-Tool".project_owner_members
  FOR SELECT TO authenticated USING (true);

-- The owner themselves, project creator, or admin can manage the pool.
CREATE POLICY "project_owner_members_write" ON "Marketing-PM-Tool".project_owner_members
  FOR ALL TO authenticated
  USING (
    "Marketing-PM-Tool".is_admin()
    OR EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".project_owners po
      JOIN "Marketing-PM-Tool".projects p ON p.id = po.project_id
      WHERE po.id = owner_id
        AND (po.user_id = auth.uid() OR p.created_by = auth.uid())
    )
  )
  WITH CHECK (
    "Marketing-PM-Tool".is_admin()
    OR EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".project_owners po
      JOIN "Marketing-PM-Tool".projects p ON p.id = po.project_id
      WHERE po.id = owner_id
        AND (po.user_id = auth.uid() OR p.created_by = auth.uid())
    )
  );
