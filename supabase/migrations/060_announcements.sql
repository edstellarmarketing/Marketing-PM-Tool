-- ─────────────────────────────────────────────────────────────────────────────
-- Announcements + screenshot attachments (announcements & tasks)
--
-- An admin posts an announcement tagged to one or more departments. The first
-- member in a tagged department to Accept turns it into a task on their list,
-- with the announcement's due date locked. Open announcements auto-expire 30
-- days after creation via a daily cron job.
--
-- See announcementsplan.md for the full design.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Enums ─────────────────────────────────────────────────────────────────
CREATE TYPE "Marketing-PM-Tool".announcement_status AS ENUM ('open', 'active');

-- ── 2. announcements ─────────────────────────────────────────────────────────
CREATE TABLE "Marketing-PM-Tool".announcements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  description       text,
  departments       text[] NOT NULL CHECK (cardinality(departments) > 0),
  due_date          date NOT NULL,
  priority          "Marketing-PM-Tool".task_priority NOT NULL DEFAULT 'medium',
  task_type         text,
  complexity        text,
  category          text,
  award_type_id     uuid REFERENCES "Marketing-PM-Tool".award_types(id) ON DELETE SET NULL,
  bonus_points      int NOT NULL DEFAULT 0,
  score_weight      int,
  status            "Marketing-PM-Tool".announcement_status NOT NULL DEFAULT 'open',
  accepted_by       uuid REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL,
  accepted_at       timestamptz,
  accepted_task_id  uuid REFERENCES "Marketing-PM-Tool".tasks(id) ON DELETE SET NULL,
  created_by        uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX announcements_departments_idx ON "Marketing-PM-Tool".announcements USING GIN (departments);
CREATE INDEX announcements_status_expires_idx ON "Marketing-PM-Tool".announcements (status, expires_at);
CREATE INDEX announcements_accepted_by_idx ON "Marketing-PM-Tool".announcements (accepted_by);
CREATE INDEX announcements_award_type_idx ON "Marketing-PM-Tool".announcements (award_type_id);
CREATE INDEX announcements_created_by_idx ON "Marketing-PM-Tool".announcements (created_by);

CREATE TRIGGER announcements_updated_at
  BEFORE UPDATE ON "Marketing-PM-Tool".announcements
  FOR EACH ROW EXECUTE FUNCTION "Marketing-PM-Tool".set_updated_at();

-- ── 3. Link tasks back to their source announcement ──────────────────────────
ALTER TABLE "Marketing-PM-Tool".tasks
  ADD COLUMN source_announcement_id uuid REFERENCES "Marketing-PM-Tool".announcements(id) ON DELETE SET NULL;

CREATE INDEX tasks_source_announcement_idx ON "Marketing-PM-Tool".tasks (source_announcement_id);

-- ── 4. announcement_attachments (admin reference screenshots) ────────────────
CREATE TABLE "Marketing-PM-Tool".announcement_attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id   uuid NOT NULL REFERENCES "Marketing-PM-Tool".announcements(id) ON DELETE CASCADE,
  storage_path      text NOT NULL,
  file_name         text NOT NULL,
  mime_type         text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp','image/gif')),
  size_bytes        int  NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  uploaded_by       uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX announcement_attachments_parent_idx ON "Marketing-PM-Tool".announcement_attachments (announcement_id);

-- ── 5. task_attachments (member proof-of-success screenshots) ────────────────
CREATE TABLE "Marketing-PM-Tool".task_attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid NOT NULL REFERENCES "Marketing-PM-Tool".tasks(id) ON DELETE CASCADE,
  storage_path      text NOT NULL,
  file_name         text NOT NULL,
  mime_type         text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp','image/gif')),
  size_bytes        int  NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  uploaded_by       uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX task_attachments_parent_idx ON "Marketing-PM-Tool".task_attachments (task_id);
CREATE INDEX task_attachments_uploader_idx ON "Marketing-PM-Tool".task_attachments (uploaded_by);

-- ── 6. Helpers ───────────────────────────────────────────────────────────────
-- Caller's own profile.department (NULL if no profile / no department).
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".my_department()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT department FROM "Marketing-PM-Tool".profiles WHERE id = auth.uid();
$$;

-- ── 7. RLS — enable ──────────────────────────────────────────────────────────
ALTER TABLE "Marketing-PM-Tool".announcements             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".announcement_attachments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".task_attachments          ENABLE ROW LEVEL SECURITY;

-- ── 8. RLS — announcements ───────────────────────────────────────────────────
-- SELECT: any authenticated user can read. Department-scoping for members is
-- enforced in the API layer so admins can see everything (matches the project
-- convention used by tasks).
CREATE POLICY "announcements_select_all" ON "Marketing-PM-Tool".announcements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "announcements_insert_admin" ON "Marketing-PM-Tool".announcements
  FOR INSERT TO authenticated
  WITH CHECK ("Marketing-PM-Tool".is_admin());

CREATE POLICY "announcements_delete_admin" ON "Marketing-PM-Tool".announcements
  FOR DELETE TO authenticated
  USING ("Marketing-PM-Tool".is_admin());

-- UPDATE: admins can update anything. Members can accept (status open→active)
-- if their department is in the target list AND the row is still open. The
-- BEFORE UPDATE trigger below pins the *shape* of a member's update so they
-- can't sneak other column changes through this policy.
CREATE POLICY "announcements_update_admin_or_accept" ON "Marketing-PM-Tool".announcements
  FOR UPDATE TO authenticated
  USING (
    "Marketing-PM-Tool".is_admin()
    OR (
      status = 'open'
      AND "Marketing-PM-Tool".my_department() = ANY(departments)
    )
  )
  WITH CHECK (
    "Marketing-PM-Tool".is_admin()
    OR (
      status = 'active'
      AND accepted_by = auth.uid()
      AND "Marketing-PM-Tool".my_department() = ANY(departments)
    )
  );

-- Trigger: when a non-admin updates an announcement, the only legal change is
-- the accept transition. Any other field mutation by a non-admin is rejected.
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".enforce_announcement_accept_shape()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF "Marketing-PM-Tool".is_admin() THEN
    RETURN NEW;
  END IF;

  -- Required: open → active flip with the current user as the accepter.
  IF OLD.status <> 'open' OR NEW.status <> 'active' THEN
    RAISE EXCEPTION 'Only admins can modify an announcement outside the accept transition';
  END IF;
  IF NEW.accepted_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'accepted_by must equal the caller';
  END IF;
  IF NEW.accepted_at IS NULL OR NEW.accepted_task_id IS NULL THEN
    RAISE EXCEPTION 'accepted_at and accepted_task_id must be set when accepting';
  END IF;

  -- Reject changes to any field other than the accept payload.
  IF NEW.title             IS DISTINCT FROM OLD.title
     OR NEW.description    IS DISTINCT FROM OLD.description
     OR NEW.departments    IS DISTINCT FROM OLD.departments
     OR NEW.due_date       IS DISTINCT FROM OLD.due_date
     OR NEW.priority       IS DISTINCT FROM OLD.priority
     OR NEW.task_type      IS DISTINCT FROM OLD.task_type
     OR NEW.complexity     IS DISTINCT FROM OLD.complexity
     OR NEW.category       IS DISTINCT FROM OLD.category
     OR NEW.award_type_id  IS DISTINCT FROM OLD.award_type_id
     OR NEW.bonus_points   IS DISTINCT FROM OLD.bonus_points
     OR NEW.score_weight   IS DISTINCT FROM OLD.score_weight
     OR NEW.created_by     IS DISTINCT FROM OLD.created_by
     OR NEW.expires_at     IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'Non-admins can only update accept fields (status, accepted_by, accepted_at, accepted_task_id)';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER announcements_enforce_accept_shape
  BEFORE UPDATE ON "Marketing-PM-Tool".announcements
  FOR EACH ROW EXECUTE FUNCTION "Marketing-PM-Tool".enforce_announcement_accept_shape();

-- ── 9. RLS — announcement_attachments ────────────────────────────────────────
CREATE POLICY "announcement_attachments_select" ON "Marketing-PM-Tool".announcement_attachments
  FOR SELECT TO authenticated
  USING (
    "Marketing-PM-Tool".is_admin()
    OR EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".announcements a
      WHERE a.id = announcement_attachments.announcement_id
        AND "Marketing-PM-Tool".my_department() = ANY(a.departments)
    )
  );

CREATE POLICY "announcement_attachments_insert_admin" ON "Marketing-PM-Tool".announcement_attachments
  FOR INSERT TO authenticated
  WITH CHECK ("Marketing-PM-Tool".is_admin());

-- Admin who uploaded it, or any admin while the parent is still 'open'.
CREATE POLICY "announcement_attachments_delete_admin" ON "Marketing-PM-Tool".announcement_attachments
  FOR DELETE TO authenticated
  USING (
    "Marketing-PM-Tool".is_admin()
    AND (
      uploaded_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM "Marketing-PM-Tool".announcements a
        WHERE a.id = announcement_attachments.announcement_id
          AND a.status = 'open'
      )
    )
  );

-- ── 10. RLS — task_attachments ───────────────────────────────────────────────
CREATE POLICY "task_attachments_select" ON "Marketing-PM-Tool".task_attachments
  FOR SELECT TO authenticated
  USING (
    "Marketing-PM-Tool".is_admin()
    OR EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".tasks t
      WHERE t.id = task_attachments.task_id
        AND (t.user_id = auth.uid() OR t.assigned_by = auth.uid())
    )
  );

-- Task owner (or admin) can upload — but only while approval_status is not yet 'approved'.
CREATE POLICY "task_attachments_insert" ON "Marketing-PM-Tool".task_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".tasks t
      WHERE t.id = task_attachments.task_id
        AND ("Marketing-PM-Tool".is_admin() OR t.user_id = auth.uid())
        AND t.approval_status <> 'approved'
    )
  );

-- Uploader can delete own rows while task is unapproved; admins can always delete.
CREATE POLICY "task_attachments_delete" ON "Marketing-PM-Tool".task_attachments
  FOR DELETE TO authenticated
  USING (
    "Marketing-PM-Tool".is_admin()
    OR (
      uploaded_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM "Marketing-PM-Tool".tasks t
        WHERE t.id = task_attachments.task_id
          AND t.approval_status <> 'approved'
      )
    )
  );

-- ── 11. Expiry function ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".expire_open_announcements()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE n int;
BEGIN
  DELETE FROM "Marketing-PM-Tool".announcements
    WHERE status = 'open'
      AND expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ── 12. Storage buckets (private) ────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('announcement-attachments', 'announcement-attachments', false, 5242880,
   ARRAY['image/png','image/jpeg','image/webp','image/gif']),
  ('task-attachments', 'task-attachments', false, 5242880,
   ARRAY['image/png','image/jpeg','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Storage object policies: clients cannot read/write objects directly. The API
-- layer uses the service role to upload and mints short-lived signed URLs for
-- read. We still install minimal policies as defense in depth:
--   - SELECT/INSERT/DELETE are all admin-only at the storage layer.
-- A leaked signed URL still works (that's the contract of signed URLs), but
-- nobody can list/browse the bucket without going through the API.
CREATE POLICY "announcement_attachments_storage_admin" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'announcement-attachments' AND "Marketing-PM-Tool".is_admin())
  WITH CHECK (bucket_id = 'announcement-attachments' AND "Marketing-PM-Tool".is_admin());

CREATE POLICY "task_attachments_storage_admin" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'task-attachments' AND "Marketing-PM-Tool".is_admin())
  WITH CHECK (bucket_id = 'task-attachments' AND "Marketing-PM-Tool".is_admin());

-- ── 13. Grants ───────────────────────────────────────────────────────────────
GRANT ALL ON "Marketing-PM-Tool".announcements,
             "Marketing-PM-Tool".announcement_attachments,
             "Marketing-PM-Tool".task_attachments
  TO authenticated, service_role;
