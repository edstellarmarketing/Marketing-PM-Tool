-- ─────────────────────────────────────────────────────────────────────────────
-- Expenses: one definition of link-domain normalisation
--
-- Migration 072 inlined the normalisation into the `link_domain` generated
-- column. Phase 4 adds a duplicate warning that must ask "does any existing row
-- share this domain?" for a URL the user is still typing — which needs the same
-- normalisation applied to an arbitrary string, outside any row.
--
-- Reimplementing that regex in TypeScript would mean two definitions that must
-- agree forever. When they drift, the duplicate warning silently stops matching
-- and nobody notices: it fails by staying quiet. So the logic moves into an
-- IMMUTABLE function used by BOTH the generated column and the API.
--
-- Safe to run destructively here: `link_domain` is derived, so dropping and
-- recreating it loses nothing, and at time of writing `expenses` is empty.
-- ─────────────────────────────────────────────────────────────────────────────

-- Strip protocol, strip a leading www., drop everything from the first slash,
-- lowercase. IMMUTABLE (required for use in a generated column) and STRICT-safe:
-- a NULL input yields '' so the column is never NULL, matching 072's behaviour.
CREATE OR REPLACE FUNCTION "Marketing-PM-Tool".expense_link_domain(url text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(split_part(
    regexp_replace(
      regexp_replace(COALESCE(url, ''), '^https?://', '', 'i'),
      '^www\.', '', 'i'),
    '/', 1));
$$;

GRANT EXECUTE ON FUNCTION "Marketing-PM-Tool".expense_link_domain(text) TO authenticated, service_role;

-- Recreate the column in terms of the function. Dropping it takes the index
-- with it, so that is rebuilt below.
ALTER TABLE "Marketing-PM-Tool".expenses DROP COLUMN link_domain;

ALTER TABLE "Marketing-PM-Tool".expenses
  ADD COLUMN link_domain text
  GENERATED ALWAYS AS (
    "Marketing-PM-Tool".expense_link_domain(COALESCE(NULLIF(link_site, ''), link_url))
  ) STORED;

CREATE INDEX expenses_link_domain_idx ON "Marketing-PM-Tool".expenses (link_domain)
  WHERE link_domain <> '' AND deleted_at IS NULL;
