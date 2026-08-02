-- ─────────────────────────────────────────────────────────────────────────────
-- Expenses — a short, stable reference on every record
--
-- Every row already has a uuid primary key, and it is already unique. What it is
-- not is workable in a spreadsheet: 36 characters, easy to truncate, impossible
-- to read out loud, and Excel will happily mangle one on a copy-paste. Since the
-- point of this identifier is an export → edit → re-import round trip, it needs
-- to survive a spreadsheet.
--
--   expenses            EXP-000001
--   expense_subscriptions  SUB-0001
--
-- Properties that make it safe as an import key:
--   * assigned by a sequence, so it is never reused, even after a delete
--   * immutable: no UPDATE path sets it, and the text form is GENERATED, so it
--     cannot drift from the number it is derived from
--   * survives a soft delete and a restore unchanged, so a code in someone's
--     spreadsheet still points at the same row a week later
--
-- The uuid stays the real primary key. This is an external handle, not a new
-- identity — foreign keys are untouched.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── expenses ────────────────────────────────────────────────────────────────
ALTER TABLE "Marketing-PM-Tool".expenses
  ADD COLUMN IF NOT EXISTS ref_seq bigint;

CREATE SEQUENCE IF NOT EXISTS "Marketing-PM-Tool".expense_ref_seq AS bigint START 1;

-- Backfill in a deterministic order so the numbering follows the ledger's own
-- chronology rather than whatever order the rows happen to sit in on disk.
-- Oldest charge gets EXP-000001.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY expense_date, created_at, id) AS rn
  FROM "Marketing-PM-Tool".expenses
  WHERE ref_seq IS NULL
)
UPDATE "Marketing-PM-Tool".expenses e
SET ref_seq = o.rn
FROM ordered o
WHERE e.id = o.id;

-- Move the sequence past the backfill so the next insert cannot collide.
SELECT setval(
  '"Marketing-PM-Tool".expense_ref_seq',
  GREATEST(COALESCE((SELECT MAX(ref_seq) FROM "Marketing-PM-Tool".expenses), 0), 1),
  -- is_called = true when rows exist, so nextval returns MAX + 1; false on an
  -- empty table so the first row is 1 rather than 2.
  (SELECT COUNT(*) > 0 FROM "Marketing-PM-Tool".expenses)
);

ALTER TABLE "Marketing-PM-Tool".expenses
  ALTER COLUMN ref_seq SET DEFAULT nextval('"Marketing-PM-Tool".expense_ref_seq'),
  ALTER COLUMN ref_seq SET NOT NULL;

-- 6 digits covers ~1M rows; wider numbers simply print longer rather than break.
ALTER TABLE "Marketing-PM-Tool".expenses
  ADD COLUMN IF NOT EXISTS ref text
    GENERATED ALWAYS AS ('EXP-' || lpad(ref_seq::text, 6, '0')) STORED;

-- Unique so a duplicated code can never reach the table, and indexed because the
-- future importer will look rows up by it.
CREATE UNIQUE INDEX IF NOT EXISTS expenses_ref_key ON "Marketing-PM-Tool".expenses (ref);

-- ── expense_subscriptions ───────────────────────────────────────────────────
ALTER TABLE "Marketing-PM-Tool".expense_subscriptions
  ADD COLUMN IF NOT EXISTS ref_seq bigint;

CREATE SEQUENCE IF NOT EXISTS "Marketing-PM-Tool".expense_subscription_ref_seq AS bigint START 1;

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM "Marketing-PM-Tool".expense_subscriptions
  WHERE ref_seq IS NULL
)
UPDATE "Marketing-PM-Tool".expense_subscriptions s
SET ref_seq = o.rn
FROM ordered o
WHERE s.id = o.id;

SELECT setval(
  '"Marketing-PM-Tool".expense_subscription_ref_seq',
  GREATEST(COALESCE((SELECT MAX(ref_seq) FROM "Marketing-PM-Tool".expense_subscriptions), 0), 1),
  (SELECT COUNT(*) > 0 FROM "Marketing-PM-Tool".expense_subscriptions)
);

ALTER TABLE "Marketing-PM-Tool".expense_subscriptions
  ALTER COLUMN ref_seq SET DEFAULT nextval('"Marketing-PM-Tool".expense_subscription_ref_seq'),
  ALTER COLUMN ref_seq SET NOT NULL;

ALTER TABLE "Marketing-PM-Tool".expense_subscriptions
  ADD COLUMN IF NOT EXISTS ref text
    GENERATED ALWAYS AS ('SUB-' || lpad(ref_seq::text, 4, '0')) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS expense_subscriptions_ref_key
  ON "Marketing-PM-Tool".expense_subscriptions (ref);

-- The sequences must be usable by the roles that insert. Writes go through the
-- service-role client, but grant to authenticated too so a future RLS-backed
-- insert path does not fail on the sequence rather than the policy.
GRANT USAGE, SELECT ON SEQUENCE "Marketing-PM-Tool".expense_ref_seq              TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE "Marketing-PM-Tool".expense_subscription_ref_seq TO authenticated, service_role;

COMMENT ON COLUMN "Marketing-PM-Tool".expenses.ref IS
  'Stable external handle (EXP-000001) for spreadsheet round-trips. Immutable; never reused. The uuid id remains the primary key.';
COMMENT ON COLUMN "Marketing-PM-Tool".expense_subscriptions.ref IS
  'Stable external handle (SUB-0001) for spreadsheet round-trips. Immutable; never reused.';
