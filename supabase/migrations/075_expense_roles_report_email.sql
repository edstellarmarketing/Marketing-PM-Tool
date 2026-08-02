-- ─────────────────────────────────────────────────────────────────────────────
-- Expenses: roles, a public report token, and weekly-email settings
--
-- Three related changes:
--
-- 1. ROLES. Access to the module was previously all-or-nothing. It now splits
--    into `viewer` (read everything, change nothing — the CEO) and `manager`
--    (add, edit and delete ledger records). Deletion moves from "the module
--    owner only" to "managers only"; the owner is always treated as a manager
--    so nothing they could do before is lost.
--
-- 2. PUBLIC REPORT TOKEN. A read-only report reachable with no login, at
--    /expenses/r/<token>. This is a deliberate exception to the module's
--    everything-behind-auth posture, so the token is revocable (enabled flag),
--    rotatable, and the page it serves exposes aggregates only — never the
--    ledger rows, links, payees or notes.
--
-- 3. WEEKLY EMAIL. Recipients are app users; the on/off switch reuses the
--    existing `email_settings` key/enabled table the other digests use.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Roles ─────────────────────────────────────────────────────────────────
CREATE TYPE "Marketing-PM-Tool".expense_module_role AS ENUM ('viewer', 'manager');

-- Defaults to the lesser privilege: a grant added without thinking about it
-- should not be able to delete four years of financial history.
ALTER TABLE "Marketing-PM-Tool".module_access
  ADD COLUMN role "Marketing-PM-Tool".expense_module_role NOT NULL DEFAULT 'viewer';

-- Everyone already granted (just the bootstrap owner) keeps what they had.
UPDATE "Marketing-PM-Tool".module_access SET role = 'manager';

-- Does the current user hold `key` with at least manager rights? Mirrors
-- has_module_access() and is the SQL half of requireModuleRole().
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".has_module_manage(key text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Marketing-PM-Tool".module_access
    WHERE user_id = auth.uid() AND module_key = key AND role = 'manager'
  );
$$;

GRANT EXECUTE ON FUNCTION "Marketing-PM-Tool".has_module_manage(text) TO authenticated, service_role;

-- Writes now need manage rights, not merely access. Reads are unchanged, so a
-- viewer still sees everything.
DROP POLICY IF EXISTS "expenses_insert" ON "Marketing-PM-Tool".expenses;
DROP POLICY IF EXISTS "expenses_update" ON "Marketing-PM-Tool".expenses;
CREATE POLICY "expenses_insert" ON "Marketing-PM-Tool".expenses
  FOR INSERT TO authenticated WITH CHECK ("Marketing-PM-Tool".has_module_manage('expenses'));
CREATE POLICY "expenses_update" ON "Marketing-PM-Tool".expenses
  FOR UPDATE TO authenticated
  USING ("Marketing-PM-Tool".has_module_manage('expenses'))
  WITH CHECK ("Marketing-PM-Tool".has_module_manage('expenses'));

DROP POLICY IF EXISTS "expense_subscriptions_insert" ON "Marketing-PM-Tool".expense_subscriptions;
DROP POLICY IF EXISTS "expense_subscriptions_update" ON "Marketing-PM-Tool".expense_subscriptions;
CREATE POLICY "expense_subscriptions_insert" ON "Marketing-PM-Tool".expense_subscriptions
  FOR INSERT TO authenticated WITH CHECK ("Marketing-PM-Tool".has_module_manage('expenses'));
CREATE POLICY "expense_subscriptions_update" ON "Marketing-PM-Tool".expense_subscriptions
  FOR UPDATE TO authenticated
  USING ("Marketing-PM-Tool".has_module_manage('expenses'))
  WITH CHECK ("Marketing-PM-Tool".has_module_manage('expenses'));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'expense_categories', 'expense_teams', 'expense_verticals',
    'expense_vendors', 'expense_backlink_types'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON "Marketing-PM-Tool".%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON "Marketing-PM-Tool".%I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON "Marketing-PM-Tool".%I FOR INSERT TO authenticated '
      'WITH CHECK ("Marketing-PM-Tool".has_module_manage(''expenses''))', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON "Marketing-PM-Tool".%I FOR UPDATE TO authenticated '
      'USING ("Marketing-PM-Tool".has_module_manage(''expenses'')) '
      'WITH CHECK ("Marketing-PM-Tool".has_module_manage(''expenses''))', t || '_update', t);
  END LOOP;
END
$$;

-- ── 2. Public report token ───────────────────────────────────────────────────
-- One row, ever. `id` is pinned so the row can be upserted without a lookup and
-- a second one cannot be created by accident.
CREATE TABLE "Marketing-PM-Tool".expense_public_report (
  id          boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- 64 hex chars ≈ 256 bits. Anyone holding this reads the report, so it is
  -- generated server-side and never derived from anything guessable.
  token       text NOT NULL UNIQUE,
  -- The kill switch. Revoking beats rotating when a link has leaked, because it
  -- takes effect without having to redistribute anything.
  enabled     boolean NOT NULL DEFAULT false,
  rotated_at  timestamptz NOT NULL DEFAULT now(),
  rotated_by  uuid REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "Marketing-PM-Tool".expense_public_report (token, enabled)
VALUES (
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  false
)
ON CONFLICT DO NOTHING;

-- Unreadable by `authenticated` and `anon` alike: RLS on with no policies and no
-- grant. The public page resolves the token through the service-role client in
-- its route handler, which is the only path in.
ALTER TABLE "Marketing-PM-Tool".expense_public_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".expense_public_report FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "Marketing-PM-Tool".expense_public_report FROM authenticated, anon;
GRANT ALL ON "Marketing-PM-Tool".expense_public_report TO service_role;

-- ── 3. Weekly email ──────────────────────────────────────────────────────────
CREATE TABLE "Marketing-PM-Tool".expense_report_recipients (
  user_id    uuid PRIMARY KEY REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  added_by   uuid REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Same pattern as module_access: service role only, route handler is the
-- authorization boundary.
ALTER TABLE "Marketing-PM-Tool".expense_report_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".expense_report_recipients FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "Marketing-PM-Tool".expense_report_recipients FROM authenticated, anon;
GRANT ALL ON "Marketing-PM-Tool".expense_report_recipients TO service_role;

-- The on/off switch, in the same table the other digests use so it appears
-- alongside them rather than inventing a parallel mechanism.
INSERT INTO "Marketing-PM-Tool".email_settings (key, enabled)
VALUES ('expenses_weekly_spend', false)
ON CONFLICT (key) DO NOTHING;
