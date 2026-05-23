-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-accept announcements + user-targeting.
--
-- Replaces the single-accept model with a per-acceptance row.
--   • target_mode: 'department' or 'users'
--   • user_ids[]:  who is explicitly tagged (only for target_mode='users')
--   • announcement_acceptances: one row per (announcement, user) pair, with
--     status 'requested' (dept flow, awaiting admin approval) or 'approved'
--     (admin has greenlit, task created). Tasks now exist only for approved
--     rows. Bonus points are split among approved rows at task-approval time.
--
-- Backfills existing single-accept rows into the new table as status='approved'
-- so the legacy data continues to render. The legacy accepted_by/accepted_at/
-- accepted_task_id columns are KEPT for now (no destructive drops) — app code
-- migrates over to the new table as the source of truth.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Enum for acceptance status
CREATE TYPE "Marketing-PM-Tool".acceptance_status AS ENUM ('requested', 'approved');

-- 2. New columns on announcements
ALTER TABLE "Marketing-PM-Tool".announcements
  ADD COLUMN target_mode text NOT NULL DEFAULT 'department'
    CHECK (target_mode IN ('department', 'users')),
  ADD COLUMN user_ids uuid[] NOT NULL DEFAULT '{}';

-- The CHECK on departments (cardinality > 0) was inline in the column
-- definition (anonymous constraint). We need to relax it: departments may be
-- empty when target_mode='users'. Find and drop, then add the new logical CHECK.
DO $$
DECLARE c_name text;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = '"Marketing-PM-Tool".announcements'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%cardinality%departments%';
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "Marketing-PM-Tool".announcements DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

ALTER TABLE "Marketing-PM-Tool".announcements
  ADD CONSTRAINT announcements_target_populated_check CHECK (
    (target_mode = 'department' AND cardinality(departments) > 0)
    OR
    (target_mode = 'users' AND cardinality(user_ids) > 0)
  );

CREATE INDEX announcements_user_ids_idx ON "Marketing-PM-Tool".announcements USING GIN (user_ids);

-- 3. Acceptances table
CREATE TABLE "Marketing-PM-Tool".announcement_acceptances (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id  uuid NOT NULL REFERENCES "Marketing-PM-Tool".announcements(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  status           "Marketing-PM-Tool".acceptance_status NOT NULL DEFAULT 'requested',
  task_id          uuid REFERENCES "Marketing-PM-Tool".tasks(id) ON DELETE SET NULL,
  requested_at     timestamptz NOT NULL DEFAULT now(),
  approved_at      timestamptz,
  approved_by      uuid REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL,
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX announcement_acceptances_ann_idx       ON "Marketing-PM-Tool".announcement_acceptances (announcement_id);
CREATE INDEX announcement_acceptances_user_idx      ON "Marketing-PM-Tool".announcement_acceptances (user_id);
CREATE INDEX announcement_acceptances_ann_status_idx ON "Marketing-PM-Tool".announcement_acceptances (announcement_id, status);

-- 4. Backfill: any announcement with accepted_by != NULL becomes one approved row
INSERT INTO "Marketing-PM-Tool".announcement_acceptances
  (announcement_id, user_id, status, task_id, requested_at, approved_at, approved_by)
SELECT
  id, accepted_by, 'approved'::"Marketing-PM-Tool".acceptance_status,
  accepted_task_id, accepted_at, accepted_at, created_by
FROM "Marketing-PM-Tool".announcements
WHERE accepted_by IS NOT NULL
ON CONFLICT (announcement_id, user_id) DO NOTHING;

-- 5. RLS
ALTER TABLE "Marketing-PM-Tool".announcement_acceptances ENABLE ROW LEVEL SECURITY;

-- SELECT: admin sees all; the requesting user sees their own; the announcement
-- creator sees all rows on their announcement.
CREATE POLICY "announcement_acceptances_select" ON "Marketing-PM-Tool".announcement_acceptances
  FOR SELECT TO authenticated
  USING (
    "Marketing-PM-Tool".is_admin()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".announcements a
      WHERE a.id = announcement_acceptances.announcement_id
        AND a.created_by = auth.uid()
    )
  );

-- INSERT: a user can create their own acceptance row IF they're eligible to
-- see the announcement (dept match for dept-targeted, in user_ids for
-- user-targeted). Shape pinning is in the BEFORE INSERT trigger below to
-- prevent setting status='approved' as a non-admin or pointing task_id at
-- someone else's task.
CREATE POLICY "announcement_acceptances_insert_self" ON "Marketing-PM-Tool".announcement_acceptances
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM "Marketing-PM-Tool".announcements a
      WHERE a.id = announcement_acceptances.announcement_id
        AND a.status = 'open'
        AND (
          (a.target_mode = 'department' AND "Marketing-PM-Tool".my_department() = ANY(a.departments))
          OR
          (a.target_mode = 'users'      AND auth.uid() = ANY(a.user_ids))
        )
    )
  );

-- UPDATE: admin only (to flip 'requested' → 'approved' and stamp task_id).
CREATE POLICY "announcement_acceptances_update_admin" ON "Marketing-PM-Tool".announcement_acceptances
  FOR UPDATE TO authenticated
  USING ("Marketing-PM-Tool".is_admin() OR auth.uid() IS NULL)
  WITH CHECK ("Marketing-PM-Tool".is_admin() OR auth.uid() IS NULL);

-- DELETE: admin only (or service role with NULL auth).
CREATE POLICY "announcement_acceptances_delete_admin" ON "Marketing-PM-Tool".announcement_acceptances
  FOR DELETE TO authenticated
  USING ("Marketing-PM-Tool".is_admin() OR auth.uid() IS NULL);

-- 6. Shape trigger on INSERT — pin the initial state.
-- Service role (NULL auth) bypasses (same pattern as 061).
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".enforce_acceptance_insert_shape()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_mode_v text;
BEGIN
  -- Service role bypass
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF "Marketing-PM-Tool".is_admin() THEN
    RETURN NEW;
  END IF;

  -- Non-admin: user_id must be self, no pre-set approval, no task linkage.
  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only request acceptance for yourself';
  END IF;
  IF NEW.task_id IS NOT NULL THEN
    RAISE EXCEPTION 'task_id is set by the admin approval flow, not by the requester';
  END IF;
  IF NEW.approved_at IS NOT NULL OR NEW.approved_by IS NOT NULL THEN
    RAISE EXCEPTION 'approved_at / approved_by are admin-only';
  END IF;

  SELECT target_mode INTO target_mode_v
  FROM "Marketing-PM-Tool".announcements
  WHERE id = NEW.announcement_id;

  -- For user-targeted announcements, the user has implicit admin approval —
  -- they were specifically tagged. Auto-approve. The API layer will then
  -- create the task and stamp task_id via the service-role client.
  IF target_mode_v = 'users' THEN
    NEW.status := 'approved';
    NEW.approved_at := now();
    -- approved_by stays NULL — we treat the announcement creator as implicit approver
  ELSE
    -- Department flow: must start as 'requested'
    IF NEW.status IS DISTINCT FROM 'requested' THEN
      RAISE EXCEPTION 'Department-targeted acceptances start in requested status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER announcement_acceptances_enforce_insert_shape
  BEFORE INSERT ON "Marketing-PM-Tool".announcement_acceptances
  FOR EACH ROW EXECUTE FUNCTION "Marketing-PM-Tool".enforce_acceptance_insert_shape();

-- 7. Replace the announcements UPDATE policy so the legacy "accept transition"
-- path no longer fires (we don't UPDATE announcements on accept anymore — we
-- INSERT into announcement_acceptances). Members lose the ability to UPDATE
-- announcements entirely; only admins can edit them.
DROP POLICY IF EXISTS "announcements_update_admin_or_accept" ON "Marketing-PM-Tool".announcements;
CREATE POLICY "announcements_update_admin" ON "Marketing-PM-Tool".announcements
  FOR UPDATE TO authenticated
  USING ("Marketing-PM-Tool".is_admin() OR auth.uid() IS NULL)
  WITH CHECK ("Marketing-PM-Tool".is_admin() OR auth.uid() IS NULL);

-- Drop the legacy accept-shape trigger — admins can change anything via
-- service-role; the (now-removed) member accept transition was the only
-- non-admin write path on announcements.
DROP TRIGGER IF EXISTS announcements_enforce_accept_shape ON "Marketing-PM-Tool".announcements;
DROP FUNCTION IF EXISTS "Marketing-PM-Tool".enforce_announcement_accept_shape();

-- 8. Grants
GRANT ALL ON "Marketing-PM-Tool".announcement_acceptances TO authenticated, service_role;
