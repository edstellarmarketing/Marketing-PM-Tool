-- Phase 1 (b): RLS helper functions for the team_lead role.
--
-- These mirror the existing is_admin() helper
-- (002_rls_policies.sql) and are the building blocks Phase 3/4 will use to
-- open delegated, department-scoped features to team leads. Adding them is
-- non-breaking: no policies reference them yet, and no one has the team_lead
-- role until an admin assigns it.

-- Is the current user a team lead?
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".is_team_lead()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Marketing-PM-Tool".profiles
    WHERE id = auth.uid() AND role = 'team_lead'
  );
$$;

-- The current user's department (null if unset). Useful for scoping queries.
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".my_department()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT department FROM "Marketing-PM-Tool".profiles
  WHERE id = auth.uid();
$$;

-- Does the current user manage `target`?
--   - admins manage everyone
--   - a team lead manages users in their own (non-null) department
-- A team lead with no department set manages nobody (null = null is not true).
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".manages_user(target uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    "Marketing-PM-Tool".is_admin()
    OR EXISTS (
      SELECT 1
      FROM "Marketing-PM-Tool".profiles me
      JOIN "Marketing-PM-Tool".profiles t
        ON t.department = me.department
      WHERE me.id = auth.uid()
        AND me.role = 'team_lead'
        AND me.department IS NOT NULL
        AND t.id = target
    );
$$;

GRANT EXECUTE ON FUNCTION "Marketing-PM-Tool".is_team_lead()        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION "Marketing-PM-Tool".my_department()       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION "Marketing-PM-Tool".manages_user(uuid)    TO authenticated, service_role;
