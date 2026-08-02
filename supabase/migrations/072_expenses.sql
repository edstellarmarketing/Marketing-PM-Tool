-- ─────────────────────────────────────────────────────────────────────────────
-- Expenses module — Phase 1: data foundation
--
-- Replaces the weekly manual updates to `All Subscriptions and Expenses.xlsx`
-- and the paid rows of `Combined Live Backlinks.xlsx`. Full design, source
-- analysis and reconciliation in expenses.md.
--
-- This migration is data-only: no route or page reads these tables yet.
--
-- Two tables on purpose (expenses.md §2.1): a subscription is a *commitment*
-- with a renewal date; an expense is money that *actually left*. The
-- spreadsheet conflates them, which is why its Tools & Subscriptions price
-- column sums to a number that matches no month.
--
-- Access: this module is hidden. Every table here is gated on
-- has_module_access('expenses') from migration 071 — holding the `admin` role
-- grants nothing. Deletes are soft and restricted to the module owner in the
-- route layer; no table below grants DELETE to `authenticated`.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Enums ─────────────────────────────────────────────────────────────────

-- `free` absorbs the one HARO row that reads "Free" instead of 0, and the 67
-- link-exchange rows that cost nothing. `pending` covers the 44 backlink rows
-- flagged Paid with no amount ever recorded (expenses.md §3.2).
CREATE TYPE "Marketing-PM-Tool".expense_payment_status AS ENUM
  ('paid', 'pending', 'refunded', 'free');

-- Settlement method, kept strictly separate from status — the source sheet
-- conflated the two ("Cancelled" appeared as a payment type). `link_exchange`
-- is barter: a real method that moves no cash.
CREATE TYPE "Marketing-PM-Tool".expense_payment_method AS ENUM
  ('auto_pay', 'manual', 'link_exchange');

CREATE TYPE "Marketing-PM-Tool".expense_billing_cycle AS ENUM
  ('monthly', 'yearly', 'credits', 'one_time', 'custom');

-- What we actually got for the money. The source sheet's "Dofollow / Nofollow"
-- column holds four values; "No Link" (488 rows) and "No Hyperlink" (75) both
-- mean an unlinked brand mention, so they collapse into one:
--   Dofollow      → dofollow      (1,765 rows)
--   Nofollow      → nofollow      (434)
--   No Link       → text_mention  (488)
--   No Hyperlink  → text_mention  (75)
-- Clean enough after that to be a real column rather than loose text in meta,
-- which makes "what share of paid links are dofollow" answerable.
CREATE TYPE "Marketing-PM-Tool".expense_link_rel AS ENUM
  ('dofollow', 'nofollow', 'text_mention');

CREATE TYPE "Marketing-PM-Tool".expense_subscription_status AS ENUM
  ('active', 'cancelled', 'expired');

-- ── 2. Lookup tables ─────────────────────────────────────────────────────────
-- Managed lookups rather than free text. This is the fix for the duplicate
-- spellings the spreadsheet accumulated — `HelpAB2BWriter` (39 rows) and
-- `Helpab2bWriter` (56 rows) are one vendor whose per-platform totals were
-- therefore wrong. The unique index on lower(name) makes that unrepeatable.
--
-- Rows are retired with is_active = false, never deleted: an inactive lookup
-- must still resolve for the historical rows that point at it.

CREATE TABLE "Marketing-PM-Tool".expense_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX expense_categories_name_key ON "Marketing-PM-Tool".expense_categories (lower(name));
CREATE UNIQUE INDEX expense_categories_slug_key ON "Marketing-PM-Tool".expense_categories (slug);

CREATE TABLE "Marketing-PM-Tool".expense_teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX expense_teams_name_key ON "Marketing-PM-Tool".expense_teams (lower(name));

CREATE TABLE "Marketing-PM-Tool".expense_verticals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX expense_verticals_name_key ON "Marketing-PM-Tool".expense_verticals (lower(name));

CREATE TABLE "Marketing-PM-Tool".expense_vendors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX expense_vendors_name_key ON "Marketing-PM-Tool".expense_vendors (lower(name));

CREATE TABLE "Marketing-PM-Tool".expense_backlink_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX expense_backlink_types_name_key ON "Marketing-PM-Tool".expense_backlink_types (lower(name));

-- ── 3. Seeds ─────────────────────────────────────────────────────────────────

-- The 9 groups from the Summary sheet, in its column order. The dashboard's
-- month × category matrix must reproduce that sheet cell-for-cell, so this list
-- and its order are load-bearing.
INSERT INTO "Marketing-PM-Tool".expense_categories (name, slug, sort_order) VALUES
  ('Paid Links',            'paid-links',           1),
  ('Tools / Subscriptions', 'tools-subscriptions',  2),
  ('Paid Ads',              'paid-ads',             3),
  ('HARO Links',            'haro-links',           4),
  ('GMB Profile',           'gmb-profile',          5),
  ('GMB Review',            'gmb-review',           6),
  ('Content Writer',        'content-writer',       7),
  ('Courses',               'courses',              8),
  ('Additional Cost',       'additional-cost',      9)
ON CONFLICT DO NOTHING;

-- Company-wide teams. Deliberately NOT profiles.department, which is the
-- marketing-org vocabulary (Content, Development, Publishing, SEO) — see
-- expenses.md §2.4. "Operations" spelled out from the sheet's "Operation".
INSERT INTO "Marketing-PM-Tool".expense_teams (name) VALUES
  ('Marketing'), ('Development'), ('Sales'), ('HR'),
  ('Design'), ('Content'), ('Operations'), ('Customer Success')
ON CONFLICT DO NOTHING;

-- 7 verticals from the backlinks ledger + PMPrep360 from Content Writers.
-- PMPrep361/362/363 are typos of PMPrep360 (1 row each) and are not seeded —
-- the importer maps them onto PMPrep360.
INSERT INTO "Marketing-PM-Tool".expense_verticals (name) VALUES
  ('Edstellar'), ('.NET'), ('Learning'), ('Phygital'),
  ('Rtwo'), ('DPS'), ('Imperium'), ('PMPrep360')
ON CONFLICT DO NOTHING;

-- All 20 backlink types present in the ledger, ordered by row count.
INSERT INTO "Marketing-PM-Tool".expense_backlink_types (name) VALUES
  ('Haro'), ('Link Insertion'), ('Business Listing'), ('ABC Link Exchange'),
  ('PDF Submission'), ('Local Listing'), ('Guest Post'), ('PR Site'),
  ('Direct Link Exchange'), ('Classified Ad'), ('Job Portal'), ('Web 2.0'),
  ('Paid Listing'), ('Directory'), ('Startup Listing'), ('Software Listing'),
  ('Image Submission'), ('Bookmarking Site'), ('Brand Article'),
  ('Forum Submission')
ON CONFLICT DO NOTHING;

-- 85 vendors, case-deduplicated across Day-wise Spent, Tools & Subscriptions,
-- Ad Spends and HARO Links. Two spellings normalised on the way in:
--   "Zoho Campagins" → "Zoho Campaigns"   (typo in source)
--   "Linkedin *"     → "LinkedIn *"        (inconsistent casing)
-- The importer matches vendor names case-insensitively, so the original
-- spellings still resolve.
INSERT INTO "Marketing-PM-Tool".expense_vendors (name) VALUES
  ('AdRoll'), ('Affinity Photo 2 (Multi User)'), ('Affinity V2 Universal Licence'),
  ('Affinity V2 Universal Licence (Multi User)'), ('Ahrefs'), ('Atlassian'),
  ('Bolt.new'), ('Bouncify'), ('Builder.io'), ('Canva'), ('ChatGPT'),
  ('ChatGPT (Ankit)'), ('Claude'), ('Claude (API)'), ('Claude (Darshan)'),
  ('Claude (Edstellar)'), ('Claude (Eva)'), ('Claude (Ezra)'), ('Claude (Jenny)'),
  ('Claude (Jessy)'), ('Claude (Krithi)'), ('Claude (Lisa)'), ('Claude (Maruthu)'),
  ('Claude (Phygital)'), ('Claude (Sneha)'), ('Claude (Sophia)'), ('Claude (Vijay)'),
  ('Connectively'), ('CYTRIO'), ('Dripify'), ('Edstellar Bandwidth'),
  ('Edstellar Designer Seats'), ('Edstellar Webflow Workspace'), ('Elementor'),
  ('Envato Elements'), ('Featured'), ('Featured (HARO)'), ('Figma'),
  ('Framer Imperium'), ('Gamma'), ('Genspark (Edstellar)'), ('Genspark (Learning)'),
  ('Google'), ('Grammarly'), ('HARO Direct'), ('HelpAB2BWriter'), ('Hostinger'),
  ('Invensis Designer Seats'), ('Invensis Webflow Workspace'), ('LinkedIn Jobs'),
  ('LinkedIn Premium (Abhrajeet)'), ('LinkedIn Premium (Ankit)'),
  ('LinkedIn Premium (Deepesh)'), ('LinkedIn Premium (Sai)'),
  ('LinkedIn Premium (Shaina)'), ('LinkedIn Sales Navigator (Vrisha Mam)'),
  ('LiveKit'), ('Naukri'), ('Open Router'), ('Partnero'), ('Qwoted'), ('Semrush'),
  ('SheetGPT'), ('Signal Hire'), ('SOS'), ('TidyCal'), ('TimeSync'),
  ('Ubersuggest'), ('Upwork'), ('Vento.so'), ('Vista Social'), ('Vmieo'),
  ('Webflow DPES'), ('Webflow Edstellar'), ('Webflow Invensis'),
  ('Webflow Phygital'), ('Webflow RTWO'), ('Webflow Workspace Invensis'),
  ('WP Rocket'), ('Yoast'), ('Zoho Billing'), ('Zoho Campaigns'), ('Zoho CRM'),
  ('Zoho Sales IQ'), ('Zoho Sign')
ON CONFLICT DO NOTHING;

-- ── 4. expense_subscriptions — the recurring registry ────────────────────────
-- What we are committed to. `amount_usd` is the list price PER CYCLE, so it is
-- never summed across rows with different cycles (the mistake the source sheet
-- invites). Actual charges live in `expenses`, linked by subscription_id.

CREATE TABLE "Marketing-PM-Tool".expense_subscriptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  vendor_id         uuid REFERENCES "Marketing-PM-Tool".expense_vendors(id) ON DELETE SET NULL,
  billing_cycle     "Marketing-PM-Tool".expense_billing_cycle NOT NULL,
  amount_usd        numeric(12,2) CHECK (amount_usd IS NULL OR amount_usd >= 0),
  started_on        date,
  ends_on           date,
  payment_method    "Marketing-PM-Tool".expense_payment_method,
  status            "Marketing-PM-Tool".expense_subscription_status NOT NULL DEFAULT 'active',
  -- Owner as a profile where they are a platform user, else free text: the
  -- sheet's "Responsible Person" includes non-users like "Tech Team" and
  -- "Vrisha Mam". SET NULL, not CASCADE — losing the owner must not delete the
  -- subscription record.
  owner_profile_id  uuid REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL,
  owner_name        text,
  team_id           uuid REFERENCES "Marketing-PM-Tool".expense_teams(id) ON DELETE SET NULL,
  seats             int CHECK (seats IS NULL OR seats > 0),
  invoice_url       text,
  notes             text,
  created_by        uuid REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  deleted_by        uuid REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL,
  CONSTRAINT expense_subscriptions_dates_ordered
    CHECK (ends_on IS NULL OR started_on IS NULL OR ends_on >= started_on)
);

CREATE INDEX expense_subscriptions_status_idx  ON "Marketing-PM-Tool".expense_subscriptions (status);
CREATE INDEX expense_subscriptions_ends_on_idx ON "Marketing-PM-Tool".expense_subscriptions (ends_on) WHERE deleted_at IS NULL;
CREATE INDEX expense_subscriptions_vendor_idx  ON "Marketing-PM-Tool".expense_subscriptions (vendor_id);
CREATE INDEX expense_subscriptions_team_idx    ON "Marketing-PM-Tool".expense_subscriptions (team_id);
CREATE INDEX expense_subscriptions_live_idx    ON "Marketing-PM-Tool".expense_subscriptions (name) WHERE deleted_at IS NULL;

CREATE TRIGGER expense_subscriptions_updated_at
  BEFORE UPDATE ON "Marketing-PM-Tool".expense_subscriptions
  FOR EACH ROW EXECUTE FUNCTION "Marketing-PM-Tool".set_updated_at();

-- ── 5. expenses — the money-out ledger ───────────────────────────────────────

CREATE TABLE "Marketing-PM-Tool".expenses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Actual payment / invoice date. Lower bound guards against year typos; no
  -- upper bound because CHECK cannot call now().
  expense_date       date NOT NULL CHECK (expense_date >= DATE '2015-01-01'),

  -- Net of tax — the figure the source sheets record (backlinks' "Final
  -- Price"). tax_usd stays NULL when tax was never written down, which is every
  -- imported row; that keeps "no tax" distinguishable from "not recorded" and
  -- makes total_usd equal amount_usd for all history, so the reconciliation in
  -- expenses.md §7.3 holds unchanged.
  amount_usd         numeric(12,2) NOT NULL CHECK (amount_usd >= 0),
  tax_usd            numeric(12,2) CHECK (tax_usd IS NULL OR tax_usd >= 0),
  total_usd          numeric(12,2) GENERATED ALWAYS AS (amount_usd + COALESCE(tax_usd, 0)) STORED,

  -- Pre-negotiation ask. Across 908 paid backlink rows the initial prices total
  -- $93,731.43 against $66,295.86 actually paid — a 29.3% saving the
  -- spreadsheet computes nowhere. Not constrained to be >= amount_usd; a final
  -- price above the initial ask is unusual but not impossible.
  initial_price_usd  numeric(12,2) CHECK (initial_price_usd IS NULL OR initial_price_usd >= 0),

  category_id        uuid NOT NULL REFERENCES "Marketing-PM-Tool".expense_categories(id) ON DELETE RESTRICT,
  backlink_type_id   uuid REFERENCES "Marketing-PM-Tool".expense_backlink_types(id) ON DELETE SET NULL,
  vendor_id          uuid REFERENCES "Marketing-PM-Tool".expense_vendors(id) ON DELETE SET NULL,
  subscription_id    uuid REFERENCES "Marketing-PM-Tool".expense_subscriptions(id) ON DELETE SET NULL,
  team_id            uuid REFERENCES "Marketing-PM-Tool".expense_teams(id) ON DELETE SET NULL,
  vertical_id        uuid REFERENCES "Marketing-PM-Tool".expense_verticals(id) ON DELETE SET NULL,

  -- Link fields. link_url is the specific placement, link_site the publisher we
  -- bought from. link_domain is generated in SQL rather than application code so
  -- the entry form and the importer can never normalise differently — it powers
  -- the duplicate warning, which must agree across both paths.
  link_url           text,
  link_site          text,
  link_rel           "Marketing-PM-Tool".expense_link_rel,
  link_domain        text GENERATED ALWAYS AS (
                       lower(split_part(
                         regexp_replace(
                           regexp_replace(COALESCE(NULLIF(link_site, ''), link_url, ''), '^https?://', '', 'i'),
                           '^www\.', '', 'i'),
                         '/', 1))
                     ) STORED,

  -- Who received the money (freelancer, publisher contact).
  payee              text,
  -- Who sourced it internally. The backlinks sheet's "Team" column is actually
  -- people — Sahana (528), Ranjith (457), Kiran (445), and "Freelancer" (262) —
  -- not teams, so it maps here and never to team_id.
  acquired_by        text,
  country            text,

  payment_status     "Marketing-PM-Tool".expense_payment_status NOT NULL DEFAULT 'paid',
  payment_method     "Marketing-PM-Tool".expense_payment_method,
  invoice_url        text,
  description        text,
  notes              text,

  -- Category-specific long tail (expenses.md §4.4). Never credentials: both
  -- source workbooks carry plaintext passwords, and none of it comes here.
  meta               jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Attribution. SET NULL, deliberately not the CASCADE this schema uses
  -- elsewhere (e.g. announcements.created_by): cascading would delete real
  -- financial history when an employee's account is removed. Nullable rather
  -- than RESTRICT so removing an account is never blocked by the expenses they
  -- once entered — the row survives, the attribution is what is lost.
  created_by         uuid REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- Soft delete: restricted to the module owner in the route layer, and
  -- recoverable. Financial rows should not vanish.
  deleted_at         timestamptz,
  deleted_by         uuid REFERENCES "Marketing-PM-Tool".profiles(id) ON DELETE SET NULL
);

-- Reporting indexes. Every dashboard and ledger query filters deleted_at, so
-- the hot ones are partial.
CREATE INDEX expenses_date_idx          ON "Marketing-PM-Tool".expenses (expense_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX expenses_category_date_idx ON "Marketing-PM-Tool".expenses (category_id, expense_date) WHERE deleted_at IS NULL;
CREATE INDEX expenses_team_idx          ON "Marketing-PM-Tool".expenses (team_id) WHERE deleted_at IS NULL;
CREATE INDEX expenses_vertical_idx      ON "Marketing-PM-Tool".expenses (vertical_id) WHERE deleted_at IS NULL;
CREATE INDEX expenses_vendor_idx        ON "Marketing-PM-Tool".expenses (vendor_id) WHERE deleted_at IS NULL;
CREATE INDEX expenses_backlink_type_idx ON "Marketing-PM-Tool".expenses (backlink_type_id) WHERE deleted_at IS NULL;
CREATE INDEX expenses_link_rel_idx      ON "Marketing-PM-Tool".expenses (link_rel) WHERE link_rel IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX expenses_subscription_idx  ON "Marketing-PM-Tool".expenses (subscription_id);
CREATE INDEX expenses_deleted_idx       ON "Marketing-PM-Tool".expenses (deleted_at) WHERE deleted_at IS NOT NULL;

-- Duplicate detection (expenses.md §6.3): domain tier and exact-link tier.
CREATE INDEX expenses_link_domain_idx ON "Marketing-PM-Tool".expenses (link_domain) WHERE link_domain <> '' AND deleted_at IS NULL;
CREATE INDEX expenses_link_url_idx    ON "Marketing-PM-Tool".expenses (link_url)    WHERE link_url IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON "Marketing-PM-Tool".expenses
  FOR EACH ROW EXECUTE FUNCTION "Marketing-PM-Tool".set_updated_at();

-- ── 6. Monthly rollup view ───────────────────────────────────────────────────
-- The dashboard's month × category matrix.
-- Both net and gross are exposed: tax is recorded from now on, but every
-- imported row has tax_usd NULL, so net = total for all history.
CREATE VIEW "Marketing-PM-Tool".expense_monthly_totals AS
SELECT
  EXTRACT(YEAR  FROM e.expense_date)::int  AS year,
  EXTRACT(MONTH FROM e.expense_date)::int  AS month,
  e.category_id,
  c.name                                   AS category_name,
  c.sort_order                             AS category_sort_order,
  SUM(e.amount_usd)                        AS net_usd,
  SUM(COALESCE(e.tax_usd, 0))              AS tax_usd,
  SUM(e.total_usd)                         AS total_usd,
  COUNT(*)                                 AS entry_count
FROM "Marketing-PM-Tool".expenses e
JOIN "Marketing-PM-Tool".expense_categories c ON c.id = e.category_id
WHERE e.deleted_at IS NULL
GROUP BY 1, 2, 3, 4, 5;

-- The view must honour the CALLER's RLS, not its owner's — handled in §9 after
-- the grants below, since the fallback path needs to revoke one of them.

-- ── 7. RLS ───────────────────────────────────────────────────────────────────
-- Two layers per AGENTS.md: RLS here, plus the route-handler guards. Access is
-- has_module_access('expenses') — NOT is_admin(). An admin without a grant sees
-- nothing, which is the whole point of a hidden module.
--
-- No DELETE policy on any table. Deletes are soft (an UPDATE setting
-- deleted_at) and performed by the route handler with the service-role client
-- after confirming the caller is the module owner.

ALTER TABLE "Marketing-PM-Tool".expense_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".expense_teams           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".expense_verticals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".expense_vendors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".expense_backlink_types  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".expense_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Marketing-PM-Tool".expenses                ENABLE ROW LEVEL SECURITY;

-- Lookups: read, create and update for module members. Vendor creation is
-- deliberately open to them (new tools appear constantly); the narrower
-- category/team/vertical management is enforced in the route layer.
--
-- Written out per operation rather than as FOR ALL, because FOR ALL would also
-- permit DELETE. Today the missing DELETE grant blocks that anyway, but a future
-- `GRANT ALL` would silently open it. Retire a lookup with is_active = false.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'expense_categories', 'expense_teams', 'expense_verticals',
    'expense_vendors', 'expense_backlink_types'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON "Marketing-PM-Tool".%I FOR SELECT TO authenticated '
      'USING ("Marketing-PM-Tool".has_module_access(''expenses''))', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON "Marketing-PM-Tool".%I FOR INSERT TO authenticated '
      'WITH CHECK ("Marketing-PM-Tool".has_module_access(''expenses''))', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON "Marketing-PM-Tool".%I FOR UPDATE TO authenticated '
      'USING ("Marketing-PM-Tool".has_module_access(''expenses'')) '
      'WITH CHECK ("Marketing-PM-Tool".has_module_access(''expenses''))', t || '_update', t);
  END LOOP;
END
$$;

-- Subscriptions + expenses: read, create and update for module members.
CREATE POLICY "expense_subscriptions_select" ON "Marketing-PM-Tool".expense_subscriptions
  FOR SELECT TO authenticated USING ("Marketing-PM-Tool".has_module_access('expenses'));
CREATE POLICY "expense_subscriptions_insert" ON "Marketing-PM-Tool".expense_subscriptions
  FOR INSERT TO authenticated WITH CHECK ("Marketing-PM-Tool".has_module_access('expenses'));
CREATE POLICY "expense_subscriptions_update" ON "Marketing-PM-Tool".expense_subscriptions
  FOR UPDATE TO authenticated
  USING ("Marketing-PM-Tool".has_module_access('expenses'))
  WITH CHECK ("Marketing-PM-Tool".has_module_access('expenses'));

CREATE POLICY "expenses_select" ON "Marketing-PM-Tool".expenses
  FOR SELECT TO authenticated USING ("Marketing-PM-Tool".has_module_access('expenses'));
CREATE POLICY "expenses_insert" ON "Marketing-PM-Tool".expenses
  FOR INSERT TO authenticated WITH CHECK ("Marketing-PM-Tool".has_module_access('expenses'));
CREATE POLICY "expenses_update" ON "Marketing-PM-Tool".expenses
  FOR UPDATE TO authenticated
  USING ("Marketing-PM-Tool".has_module_access('expenses'))
  WITH CHECK ("Marketing-PM-Tool".has_module_access('expenses'));

-- ── 8. Grants ────────────────────────────────────────────────────────────────
-- DELETE is granted to nobody but the service role: belt and braces with the
-- absent DELETE policies above.
GRANT SELECT, INSERT, UPDATE ON
  "Marketing-PM-Tool".expense_categories,
  "Marketing-PM-Tool".expense_teams,
  "Marketing-PM-Tool".expense_verticals,
  "Marketing-PM-Tool".expense_vendors,
  "Marketing-PM-Tool".expense_backlink_types,
  "Marketing-PM-Tool".expense_subscriptions,
  "Marketing-PM-Tool".expenses
  TO authenticated;

GRANT ALL ON
  "Marketing-PM-Tool".expense_categories,
  "Marketing-PM-Tool".expense_teams,
  "Marketing-PM-Tool".expense_verticals,
  "Marketing-PM-Tool".expense_vendors,
  "Marketing-PM-Tool".expense_backlink_types,
  "Marketing-PM-Tool".expense_subscriptions,
  "Marketing-PM-Tool".expenses
  TO service_role;

GRANT SELECT ON "Marketing-PM-Tool".expense_monthly_totals TO authenticated, service_role;

-- ── 9. View security ─────────────────────────────────────────────────────────
-- Make expense_monthly_totals honour the CALLER's RLS rather than its owner's.
-- Without this, a view owned by a superuser bypasses the row-level policies on
-- `expenses` and would hand any authenticated user a full spend summary
-- regardless of module access — exactly what this module exists to prevent.
--
-- `security_invoker` is Postgres 15+. On 13/14 there is no equivalent, so the
-- fallback withdraws direct access and leaves the view reachable only through
-- the service role, where the route handler is already the authorization
-- boundary. Must run after §8 because that is what created the grant.
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 150000 THEN
    EXECUTE 'ALTER VIEW "Marketing-PM-Tool".expense_monthly_totals SET (security_invoker = true)';
  ELSE
    RAISE WARNING 'Postgres < 15 (%): expense_monthly_totals cannot use security_invoker. Revoking direct SELECT from authenticated — query it via the service role only.',
      current_setting('server_version');
    EXECUTE 'REVOKE SELECT ON "Marketing-PM-Tool".expense_monthly_totals FROM authenticated';
  END IF;
END
$$;
