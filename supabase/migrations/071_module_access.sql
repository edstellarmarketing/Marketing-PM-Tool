-- ─────────────────────────────────────────────────────────────────────────────
-- Hidden modules: per-user access allowlist
--
-- Some modules are not part of the normal role matrix (admin / team_lead /
-- member). They are invisible in the UI — no sidebar entry, excluded from
-- global search — and reachable only by users explicitly listed here. Anyone
-- else gets a 404 (not a 403), so the route is indistinguishable from one that
-- does not exist.
--
-- Access is INDEPENDENT of `profiles.role` on purpose: a member may have access
-- and an admin may not. Being an admin does not grant a hidden module.
--
-- Governance: exactly one person may grant or revoke — the module grantor,
-- vijay@edstellar.com. Not "any admin": if the admin role could grant, any
-- admin could add themselves and the module would stop being limited. The
-- grantor is enforced in lib/api.ts (requireModuleGrantor) and is overridable
-- per-deploy with the MODULE_GRANTOR_EMAIL env var.
--
-- The table is unreadable by the `authenticated` role (no grants, RLS on with
-- no policies). Every read/write goes through the service-role client in a
-- route handler, which is therefore the authorization boundary — the same
-- pattern used for projects + appraisals (see migration 056 and AGENTS.md).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. module_access ─────────────────────────────────────────────────────────
CREATE TABLE "Marketing-PM-Tool".module_access (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE CASCADE,
  -- Stable slug identifying the hidden module, e.g. 'vault'. Kept as free text
  -- rather than an enum so adding a module needs no migration.
  module_key  text NOT NULL CHECK (module_key ~ '^[a-z0-9-]{2,40}$'),
  -- Who granted it. SET NULL (not CASCADE) so deleting the granter does not
  -- silently revoke everyone they onboarded.
  granted_by  uuid REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  -- Optional free-text reason, surfaced in the module's own access screen.
  note        text,
  UNIQUE (user_id, module_key)
);

-- Primary lookup: "does this user have this module?" — covered by the UNIQUE
-- index above. This one covers "who has this module?" for the access screen.
CREATE INDEX module_access_module_key_idx ON "Marketing-PM-Tool".module_access (module_key);

-- ── 2. Helper — mirrors is_admin() / is_team_lead() ──────────────────────────
-- Does the CURRENT user have access to `key`? SECURITY DEFINER so it can read
-- module_access even though `authenticated` has no grant on the table. Use it
-- in RLS policies on whatever tables the hidden module owns.
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".has_module_access(key text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Marketing-PM-Tool".module_access
    WHERE user_id = auth.uid() AND module_key = key
  );
$$;

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
-- Enabled with NO policies: the `authenticated` role can read nothing and write
-- nothing, even if a client somehow guesses the table name. Deliberate — the
-- service-role client in the route handler is the only way in.
ALTER TABLE "Marketing-PM-Tool".module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".module_access FORCE ROW LEVEL SECURITY;

-- ── 4. Grants ────────────────────────────────────────────────────────────────
-- Note the asymmetry with other tables in this schema: `authenticated` is NOT
-- granted. Only the service role touches this table.
REVOKE ALL ON "Marketing-PM-Tool".module_access FROM authenticated, anon;
GRANT ALL ON "Marketing-PM-Tool".module_access TO service_role;

GRANT EXECUTE ON FUNCTION "Marketing-PM-Tool".has_module_access(text) TO authenticated, service_role;

-- ── 5. Bootstrap the 'expenses' module ───────────────────────────────────────
-- Seed the grantor's own access so they can open /expenses and grant others
-- through the UI. Idempotent, and a no-op if the account doesn't exist yet —
-- re-run this statement after the account is created if that happens.
INSERT INTO "Marketing-PM-Tool".module_access (user_id, module_key, note)
SELECT p.id, 'expenses', 'bootstrap grant (module grantor)'
FROM "Marketing-PM-Tool".profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'vijay@edstellar.com'
ON CONFLICT (user_id, module_key) DO NOTHING;
