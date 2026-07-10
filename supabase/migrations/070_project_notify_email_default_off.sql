-- New projects start with both daily email digests off; the creator opts in
-- from Project Settings. Existing projects keep whatever they have today —
-- only the column default changes, no rows are rewritten.
ALTER TABLE "Marketing-PM-Tool".projects
  ALTER COLUMN notify_email_enabled SET DEFAULT false;

ALTER TABLE "Marketing-PM-Tool".projects
  ALTER COLUMN notify_owner_email_enabled SET DEFAULT false;
