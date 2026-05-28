-- Domain tag for projects. Renders as a prefix in the UI:
--   "Edstellar - LMS", "Invensis - <name>"
-- Nullable so existing projects keep loading; new project creation requires it
-- at the API layer.

ALTER TABLE "Marketing-PM-Tool".projects
  ADD COLUMN IF NOT EXISTS domain text;

ALTER TABLE "Marketing-PM-Tool".projects
  DROP CONSTRAINT IF EXISTS projects_domain_check;

ALTER TABLE "Marketing-PM-Tool".projects
  ADD CONSTRAINT projects_domain_check
  CHECK (domain IS NULL OR domain IN ('Edstellar', 'Invensis'));

CREATE INDEX IF NOT EXISTS idx_projects_domain
  ON "Marketing-PM-Tool".projects(domain);
