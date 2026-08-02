# Expenses module — implementation plan

Hidden module (`module_key = 'expenses'`, migration 071). Replaces the weekly
manual updates to `All Subscriptions and Expenses.xlsx` with in-platform entry
plus a monthly-snapshot / group-comparison dashboard.

Access rules already in place:
- Only people with an `expenses` grant can reach `/expenses` — everyone else
  gets a 404, and the module never appears in the sidebar or global search.
- Only `vijay@edstellar.com` can grant/revoke access (`requireModuleGrantor`).

---

## 0. Decisions — locked

| # | Question | Decision |
|---|---|---|
| 1 | Paid Links source | `Combined Live Backlinks.xlsx`, reconciled to 99.89% — §2.2 |
| 2 | Can the entry person edit? | **Yes.** Create + edit for anyone with a grant; delete stays Vijay-only |
| 3 | Tax | **Add `tax_usd`, report both.** Ex-tax and inc-tax both visible — §4.3 |
| 4 | Subscription renewals | **Manual entry**, with a "log a charge" shortcut from the subscription row — §6.4 |
| 5 | Currency | **USD only.** No multi-currency columns |
| 6 | Backfill scope | **All four years** (2023 → 2026 YTD) |
| 7 | Ad Spends grain | **Actual invoice dates** going forward — §7.4 covers what this means for history |
| 8 | Duplicate links | **Allowed.** Warn on a matching link or domain, never block — §6.3 |

**One call I made without you:** link spend keeps **two** categories (Paid Links
and HARO Links) rather than collapsing into one "Link Building" category. That
preserves cell-for-cell comparability with four years of the `Summary` sheet.
`backlink_type` gives the finer cut. Changing this later is a one-line change to
the import rule in §7.1 — say the word if you'd rather have one category.

---

## 1. What the spreadsheets actually contain

Two workbooks:
- **`All Subscriptions and Expenses.xlsx`** — 15 sheets, 10 with real expense rows (~921), 5 planning/scratch
- **`Combined Live Backlinks.xlsx`** — 3 sheets; the `Combined Live Backlinks` ledger holds **2,762 rows**, of which **1,003 are flagged Paid**

Amounts are USD throughout.

| Sheet | Rows | Sum | What it is |
|---|---|---|---|
| Content Writers | 424 | $6,645.96 | Freelance article payments (only 172 rows carry an amount) |
| Courses | 170 | $324.19 | Course-authoring assignments (only 13 rows carry an amount) |
| HARO Links | 161 | $13,307.74 | Link payments **+ platform fees** — mostly a duplicate, see §2.2 |
| Day-wise Spent | 86 | $16,305.25 | Actual tool/subscription charges — **2026 only** |
| Tools & Subscriptions | 61 | ($25,944.75) | Subscription **registry**, not payments — see §2.1 |
| Ad Spends | 13 | $5,801.83 | Paid-ads spend per campaign per month |
| GMB Profile | 2 | $220.00 | GMB listing work |
| GMB Review | 1 | $5.00 | GMB review work |
| Wikipedia | 1 | $215.00 | One-off Wikipedia page attempt (refunded) |
| Imperium Upwork | 2 | — | SDR hiring; no amounts. Do not migrate — §3.4 |
| Combined Live Backlinks | 2,762 (1,003 paid) | $66,295.86 | Every backlink, paid or free. Source for **both** Paid Links and HARO Links |

Not ledgers: **Sheet15** (empty duplicate of Summary), **Ads** (2026 budget
projections, not actuals), **SAAS Launch** (freelancer shortlist), **Rough**
(older duplicate of Tools & Subscriptions), and the backlinks workbook's own
`Summary` / `HARO analysis` sheets (link counts, not money).

### The 9 reporting groups

`Summary` is a Year × Month × Category matrix — the view the dashboard must
reproduce. Its categories become the seed category list:

**Paid Links · Tools / Subscriptions · Paid Ads · HARO Links · GMB Profile ·
GMB Review · Content Writer · Courses · Additional Cost**

Reported totals: **2023 $17,355.87 · 2024 $32,606.80 · 2025 $28,377.57 ·
2026 YTD $18,461.83** — about **$96.8k** across four years.

---

## 2. Structural findings that shape the design

### 2.1 A subscription is not a payment — the sheet conflates them

`Tools & Subscriptions` lists 61 rows with a `Price`. Those prices mix monthly,
yearly, credit-pack and one-time figures, so the $25,944.75 column sum is not a
spend number and cannot be compared to any month. `Day-wise Spent` is the real
charge ledger — its 2026 total ($16,305.25) matches the Summary's 2026
Tools/Subscriptions cell exactly.

**Design consequence:** two tables.
- `expense_subscriptions` — what we are *committed to* (renewal dates, owner, seats, status)
- `expenses` — what money *actually left*, optionally linked to a subscription

This is what makes "upcoming renewals" and "what does this tool cost per year"
answerable, which the spreadsheet cannot do today.

### 2.2 Paid Links — sourced and reconciled to 99.89%

Paid Links is $54,583.86 across four years (56% of all spend). Source:
`Combined Live Backlinks.xlsx`, filtered to `Paid / Free = Paid`.

**One sheet feeds two Summary categories, split by `Backlink Type`:**

| Split | Rows | Ledger total | Summary column | Months matched |
|---|---|---|---|---|
| `Backlink Type` ≠ Haro | 858 | $52,608.66 | Paid Links | **37 of 40 to the cent** |
| `Backlink Type` = Haro | 145 | $11,772.00 | HARO Links ($11,771.50) | **17 of 17 to the cent** |

The three unmatched Paid Links months are a **date-formatting bug, not missing
data**: 19 rows are dated `February 27,2024` / `March 6,2024` — comma with no
space, unlike every other row. They are worth $1,915.20, splitting as
**$490.00 in Feb 2024 and $1,425.20 in Mar 2024 — exactly the two gaps.**

After recovering them: **$54,523.86 vs $54,583.86 — one $60.00 gap in June
2026**, where the backlinks sheet has no rows at all. HARO differs by 50¢ of
rounding.

**The `HARO Links` sheet is a duplicate, plus platform fees.** Its $13,307.74
decomposes exactly:

```
HARO Links sheet         $13,307.74
  = Summary HARO Links   $11,771.50   ← same spend as the 145 Haro rows above
  + Summary Addl. Cost    $1,536.24   ← Qwoted/Featured/Connectively plan fees
```

Its ~145 link rows **duplicate** the backlinks sheet; its ~16 platform-fee rows
are the only unique content — and those are what "Additional Cost" has always
been. Importing both sheets naively double-counts $11,771.50 (§7.1).

### 2.3 Negotiation data is worth keeping

908 paid rows carry both an `Initial Price` and a `Final Price`:
**$93,731.43 negotiated down to $66,295.86 — $27,435.57 saved (29.3%)**.

A real KPI the spreadsheet computes nowhere. `initial_price_usd` sits alongside
`amount_usd` so the dashboard can show negotiated savings per month and vendor.

### 2.4 Expense "Team" is not the app's `profiles.department`

The spreadsheet's teams are company-wide: **Marketing (49), Development (14),
Sales (14), HR (6), Customer Success (2), Design (1)**, plus Content and
Operation in the registry — 8 values.

The app's departments are the marketing-org ones (Content, Development,
Publishing, SEO), stored as free text on `profiles.department`; there is no
departments table. Overlapping vocabularies, not the same one.

**Design consequence:** `expense_teams` is its own lookup. Do not reuse
`profiles.department` or `departmentUserIds()` here.

---

## 3. Data quality to handle

### 3.1 Dates — at least six formats
`Jan 2, 2026` · `June 20 2024` · `Oct 13 2025` · `02-Mar-22` ·
`February 27,2024` (**no space after the comma** — cost $1,915.20 in the
reconciliation until handled) · `28/01/2026` (**day-first**, Imperium Upwork).

A naive `new Date()` misreads the day-first ones; a strict parser drops the
no-space ones. The importer needs an explicit format list plus a hard failure on
anything unmatched — silent skips are what hid the $1,915.20.

### 3.2 Amounts
- 9 cells use trailing-symbol style (`15.49$`, `42$`) — 8 in Content Writers, 1 in Courses
- 1 HARO row reads `Free` instead of `0`
- Mixed decimal places (0, 1, 2)
- **44 backlink rows are flagged `Paid` with no price at all**, across 19 months.
  The Summary excluded them too, so totals reconcile — but the amounts are lost.
  Import them as `payment_status = pending`, `amount_usd = 0`, flagged in notes.

### 3.3 Duplicate / inconsistent values
- Vendor case split: `HelpAB2BWriter` (39) vs `Helpab2bWriter` (56) — one vendor, two spellings, so today's per-platform totals are wrong
- Person: `Nageswar` vs `Nageshwar`
- Vertical typos: `PMPrep360` plus `PMPrep361/362/363` (1 row each)
- Type: `One-time` (Day-wise) vs `One Time` (registry)
- `Payment Type` mixes method with state: Auto Pay (23), Manual (7), **Cancelled (16)**
- Merged group headers populate only their first row, so `Subscription Type` reads as 11% filled

**Design consequence:** vendors, teams, verticals, categories and backlink types
become managed lookups with autocomplete rather than free text.

### 3.4 Both workbooks contain plaintext credentials

- `Imperium Upwork` has `Email` / `Password` columns with real values
- **`Combined Live Backlinks` is worse: 810 rows carry a password**, across
  `Mail Id`, `Password`, `User Name`, `Internal Team Email Id`,
  `Backlink Team Email Id` — and the same password is reused across many rows,
  so one leak exposes the set. (Not quoted here: this file is in a public repo.)

**Exclude every one of these columns from any import.** The module must never
store credentials. Also a credential-rotation item worth handling independently
of this project.

---

## 4. Schema

Schema `"Marketing-PM-Tool"`, new migration `072_expenses.sql`.

### 4.1 Lookups

```
expense_categories      id, name, slug, sort_order, is_active
                        seed: the 9 groups from §1
expense_teams           id, name, is_active
                        seed: Marketing, Development, Sales, HR, Design,
                              Content, Operations, Customer Success
expense_verticals       id, name, is_active
                        seed: Edstellar, .NET, Learning, Phygital, Rtwo,
                              DPS, Imperium, PMPrep360
expense_vendors         id, name, is_active
                        seed: 43 tool names + 8 HARO platforms +
                              AdRoll/Google, de-duplicated (fixes §3.3)
expense_backlink_types  id, name, is_active
                        seed: all 20 — Haro, Link Insertion, Business
                              Listing, ABC Link Exchange, PDF Submission,
                              Local Listing, Guest Post, PR Site, Direct
                              Link Exchange, Classified Ad, Job Portal,
                              Web 2.0, Paid Listing, Directory, Startup
                              Listing, Software Listing, Image Submission,
                              Bookmarking Site, Brand Article, Forum
                              Submission
```

Each lookup carries a `UNIQUE` index on `lower(name)` — that is what stops the
`HelpAB2BWriter` / `Helpab2bWriter` split (§3.3) from ever recurring. Retire an
entry with `is_active = false`; never delete one, or the historical rows
pointing at it stop resolving.

### 4.2 `expense_subscriptions` — the recurring registry

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `name` | text not null | "Claude (Edstellar)", "Webflow Phygital" |
| `vendor_id` | → expense_vendors | |
| `billing_cycle` | enum | `monthly` `yearly` `credits` `one_time` `custom` |
| `amount_usd` | numeric(12,2) | list price **per cycle** |
| `started_on` / `ends_on` | date | `ends_on` drives the renewals widget |
| `payment_method` | enum | `auto_pay` `manual` |
| `status` | enum | `active` `cancelled` `expired` (splits out the conflated "Cancelled") |
| `owner_profile_id` | → profiles | nullable |
| `owner_name` | text | fallback for non-users ("Tech Team", "Vrisha Mam") |
| `team_id` | → expense_teams | |
| `seats` | int | from comments like "2 Premium and 3 Standard" |
| `invoice_url`, `notes` | text | |
| audit | | `created_by`, `created_at`, `updated_at`, `deleted_at`, `deleted_by` |

### 4.3 `expenses` — the money-out ledger

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `expense_date` | date **not null** | actual payment/invoice date |
| `amount_usd` | numeric(12,2) **not null** | net of tax — the sheet's `Final Price`. `CHECK (>= 0)` |
| `tax_usd` | numeric(12,2) | nullable; `NULL` = not recorded, not "zero tax" |
| `total_usd` | numeric(12,2) **generated stored** | `amount_usd + coalesce(tax_usd, 0)` |
| `initial_price_usd` | numeric(12,2) | pre-negotiation ask; savings = this − `amount_usd` |
| `category_id` | → expense_categories **not null** | the dashboard's grouping key |
| `backlink_type_id` | → expense_backlink_types | link spend only |
| `vendor_id` | → expense_vendors | tool / platform / ad network |
| `subscription_id` | → expense_subscriptions | set when the charge is a renewal |
| `team_id` | → expense_teams | |
| `vertical_id` | → expense_verticals | |
| `link_url` | text | the live link (specific placement) |
| `link_site` | text | publisher site bought from |
| `link_rel` | enum | `dofollow` `nofollow` `text_mention` — see below |
| `link_domain` | text **generated stored** | normalised host — powers duplicate detection (§6.3) |
| `payee` | text | who received the money (freelancer, publisher) |
| `acquired_by` | text | internal person who sourced it — see below |
| `country` | text | GMB rows |
| `payment_status` | enum | `paid` `pending` `refunded` `free` |
| `payment_method` | enum | `auto_pay` `manual` |
| `invoice_url`, `description`, `notes` | text | |
| `meta` | jsonb | category-specific long tail, §4.4 |
| audit | | `created_by` not null, `created_at`, `updated_at`, `deleted_at`, `deleted_by` |

**Tax.** `amount_usd` stays the ex-tax figure the sheets record, so history
reconciles unchanged (`tax_usd` is `NULL` for every imported row, making
`total_usd = amount_usd`). The dashboard headlines `total_usd` — real cash out —
with an ex-tax toggle. Keeping tax `NULL` rather than `0` preserves the
difference between "no tax" and "we never wrote it down".

**`link_rel` — 4 source values collapse to 3.** The sheet's
`Dofollow / Nofollow` column holds Dofollow (1,765), Nofollow (434), No Link
(488) and No Hyperlink (75). The last two both mean an unlinked brand mention,
so they map to a single `text_mention`. Clean enough after that to be a real
enum column rather than loose text, which makes "what share of paid links are
actually dofollow" answerable.

**`acquired_by` — the backlinks sheet's `Team` column is people, not teams.**
Its values are Sahana (528), Ranjith (457), Kiran (445), Kavya (288),
"Freelancer" (262) and 14 more — the person who sourced the link. It maps to
`acquired_by`, never to `team_id`, which stays the company-wide team vocabulary
from §2.4.

**`link_domain` is generated in SQL**, not in application code, so it cannot
drift between the importer and the form:

```sql
link_domain text GENERATED ALWAYS AS (
  lower(split_part(
    regexp_replace(
      regexp_replace(coalesce(nullif(link_site,''), link_url, ''), '^https?://', '', 'i'),
      '^www\.', '', 'i'),
    '/', 1))
) STORED
```

Indexes: `(expense_date)`, `(category_id, expense_date)`, `(team_id)`,
`(vendor_id)`, `(subscription_id)`, `(link_domain)`, `(link_url)`, and a partial
index `WHERE deleted_at IS NULL` since every dashboard query filters on it.

### 4.4 `meta` contents by category

| Category | Keys |
|---|---|
| Paid Links / HARO Links | `da`, `pa`, `ss`, `traffic`, `da_range`, `target_page`, `target_keyword`, `semrush_detected`, `search_console_detected` |
| GMB Review | `reviews_count` |
| Paid Ads | `campaign`, `campaign_status`, `ad_strategy`, `period_start`, `period_end` |
| Content Writer | `article_title`, `article_cluster`, `contract_status`, `article_status`, `doc_url`, `live_url` |
| Courses | `course_name`, `set` |

Never in `meta`: the credential columns from §3.4.

### 4.5 Monthly rollup

A plain SQL view `expense_monthly_totals (year, month, category_id, total_usd,
net_usd, tax_usd)` over non-deleted rows. At ~1k rows/year no materialised view
is needed — revisit past six figures of rows.

---

## 5. Permissions

| Action | Who |
|---|---|
| View dashboard + ledger | anyone with an `expenses` grant |
| Create an expense / subscription | anyone with an `expenses` grant |
| **Edit** a record | anyone with a grant *(decision 2)* |
| **Delete** a record | **`vijay@edstellar.com` only** |
| Restore a deleted record | `vijay@edstellar.com` only |
| Grant / revoke module access | `vijay@edstellar.com` only (built) |
| Manage categories / teams / verticals / backlink types | `vijay@edstellar.com` only — they define the dashboard |
| Add a vendor | anyone with a grant — new tools appear constantly |

**Deletes are soft.** `deleted_at` + `deleted_by`, excluded from every query and
rollup, with an owner-only "Deleted records" view to restore. A restricted
delete is worth little if the row is genuinely gone.

**One identity constant.** Delete authority and grant authority are the same
account by design, so both derive from the existing `MODULE_GRANTOR_EMAIL` in
`lib/api.ts` (default `vijay@edstellar.com`, env-overridable). Add:

```ts
requireExpenseDeleter()   // 404 unless caller is the module owner
```

**Two layers, per AGENTS.md.** Unlike `module_access`, these tables get real RLS
using the existing SQL helper:
- `SELECT` / `INSERT` / `UPDATE`: `has_module_access('expenses')`
- `DELETE`: **no policy** — soft delete is an `UPDATE` by the route handler with
  the service-role client after the email check

---

## 6. Screens

| Route | Purpose |
|---|---|
| `/expenses` | Dashboard (§6.1) |
| `/expenses/ledger` | Filterable table, add/edit/delete |
| `/expenses/subscriptions` | Registry + upcoming renewals |
| `/expenses/settings` | Lookups + the Module Access panel (moved off `/expenses`) |

All guarded by `requirePageModuleAccess('expenses')`. No sidebar entry —
cross-navigation via tabs inside the module, matching the existing
`/admin/settings?tab=` pattern.

### 6.1 Dashboard

- **KPI row** — this month, last month, Δ%, YTD, YTD vs same period last year
- **Month × Category matrix** — the `Summary` sheet reproduced, year selector, row/column totals
- **12-month trend** — total spend, optional per-category series
- **Category breakdown** — selected month, with share-of-total
- **Spend by Team** and **Spend by Vertical**
- **Top 10 vendors** for the period
- **Negotiated savings** — initial vs final, month and vendor (§2.3)
- **Tax** — ex-tax / inc-tax toggle on the headline figures
- **Upcoming renewals** — subscriptions with `ends_on` in the next 60 days
- **Comparison toggle** — MoM and YoY

`recharts` is already a dependency. Charts follow the `dataviz` skill for
palette and layout.

### 6.2 Entry form

One category-driven form: shared fields always visible, `meta` fields (§4.4)
appear only for their category. Built for the weekly batch — vendor
autocomplete, date defaulting to today, and "save and add another".

### 6.3 Duplicate warning — warn, never block *(decision 8)*

Recording the same link twice is legitimate (a second placement on the same
site, a renewal, a genuine re-buy). So the form **never blocks a duplicate** —
it surfaces what already exists and lets the user decide.

On blur of `link_url` / `link_site`, and again on submit:

| Tier | Match | Message |
|---|---|---|
| Exact | same `link_url` | "This exact link is already recorded — N entries" |
| Domain | same `link_domain` | "N existing entries for **domain** " |

The warning shows the matching rows inline — date, amount, vertical, backlink
type, who entered it — so the decision is informed rather than a yes/no prompt.
Submission proceeds either way; the button never disables.

Implementation: `GET /api/expenses/duplicates?link_url=…&link_site=…` returning
both tiers, debounced. Cheap — both columns are indexed and `link_domain` is
generated, so the form and the importer normalise identically.

Same check runs during backfill in **report-only** mode: it logs the duplicate
clusters it finds rather than skipping rows, which is how we verify the
$11,771.50 HARO overlap never gets imported twice.

### 6.4 Log a charge *(decision 4)*

Subscription rows get a **Log a charge** action that opens the entry form
pre-filled from the subscription — vendor, team, category `Tools /
Subscriptions`, amount, payment method — with `subscription_id` set and the date
defaulting to today. Nothing is auto-generated from `billing_cycle`; every row
is a deliberate entry, so the ledger never claims a charge that did not happen.

The renewals widget is the prompt: a subscription past `ends_on` with no charge
logged in that period shows as due.

---

## 7. Backfill — all four years *(decision 6)*

### 7.1 Link spend — the rule

From `Combined Live Backlinks`, rows where `Paid / Free = Paid` (1,003 rows):

```
category          = (Backlink Type == 'Haro') ? 'HARO Links' : 'Paid Links'
amount_usd        = Final Price, else Initial Price, else 0 + status pending
initial_price_usd = Initial Price
backlink_type_id  = Backlink Type            (20 distinct values)
link_url          = Live Link
link_site         = Backlink Website
link_rel          = Dofollow → dofollow, Nofollow → nofollow,
                    No Link | No Hyperlink → text_mention
acquired_by       = the sheet's "Team" column (people, not teams)
payee             = Freelancer Name
payment_method    = Link Exchange → link_exchange, else manual
vertical_id       = Vertical, with PMPrep361/362/363 → PMPrep360
meta              = the SEO fields in §4.4   (never the credential columns)
```

Two things the script must handle, both proven necessary:
- Parse `February 27,2024` (no space after comma) or lose $1,915.20
- **Skip the `HARO Links` sheet's link rows entirely** — they duplicate the 145
  Haro rows above. Import only its ~16 platform-fee rows (Qwoted PRO $1,188,
  Featured plan upgrades, Connectively pitch packs) as **Additional Cost**,
  totalling $1,536.24. Importing both double-counts $11,771.50.

Expected: Paid Links $54,523.86 vs $54,583.86 reported — a $60.00 variance in
June 2026 that the source sheet does not contain.

### 7.2 Order of confidence

1. **Link spend** — §7.1 (1,003 rows). Reconciles to 99.89%.
2. Clean and mechanical — Day-wise Spent (86), GMB Profile (2), GMB Review (1), Wikipedia (1)
3. HARO platform fees only — `HARO Links` sheet (~16 rows → Additional Cost)
4. Ad Spends (13) — see §7.4
5. Needs amount-format and vertical-typo fixes — Content Writers (172 priced rows), Courses (13)
6. Registry → `expense_subscriptions` — Tools & Subscriptions (61)

Excluded permanently: all credential columns (§3.4), Imperium Upwork, Sheet15,
Ads, SAAS Launch, Rough, and the 1,759 free backlink rows (§7.5).

### 7.3 Reconciliation is the acceptance test — RESULT

`scripts/reconcile-expenses.js` compares every month × category cell in the
database against the `Summary` sheet. **Outcome after migration 074 and the
re-import: 86 of 100 cells match to the cent, 14 differ, 0 unexplained.**

| Category | Cells differing | Cause |
|---|---|---|
| Paid Links | 1 (−$60.00, Jun 2026) | no source rows exist for that month |
| HARO Links | 2 (+$0.25 each) | Summary rounds `.75` cells |
| GMB Profile | 1 (+$0.01) | Summary rounds $62.50 to $62.49 |
| Content Writer | 8 (net +$275.45) | **the Summary contradicts its own detail sheet** — see below |
| Courses | 2 (net +$46.20) | same |

**The Summary is not a reliable oracle for Content Writer and Courses.**
Recomputing those columns straight from their detail sheets — independently of
the importer — shows the Summary differs in 8 of 17 Content Writer months and 2
Courses months, by amounts as small as **$0.25** in months where no date is
ambiguous. Those cells were maintained by hand and drifted. Notably Courses
2025-06 reads $0.00 against a real $27.30 row. For these two categories the
detail sheets are the better source, and that is what the database holds.

**Resolved by migration 074:** Content Writers row 154 is a −$20.49 credit,
which `amount_usd >= 0` could not store. It used to be clamped to $0, leaving
Apr 2025 $20.49 high; that cell now reads **$620.25, matching the Summary
exactly**.

Row statuses after the re-import: `paid` 1,197 · `pending` 47 · `free` 50 ·
`refunded` 1 — the 50 being the link exchanges and free placements the source
marks `Free`, no longer mislabelled as paid.

Yearly totals as imported: **2023 $17,355.87** (exact), **2024 $32,608.80**
(+$2.00), **2025 $28,698.93** (+$321.36), **2026 YTD $18,401.83** (−$60.00).

### 7.4 Ad Spends — invoice dates going forward, period-end for history *(decision 7)*

New entries use the actual invoice date. But the 13 historical rows record
`Campaign / Start Date / End Date / Tool / Spend` and **no invoice date** — that
information does not exist in the sheet, so it cannot be recovered.

For backfill: `expense_date = End Date` (or `Start Date` for the one active row
with a blank end), with the original period kept in
`meta.period_start` / `meta.period_end`. Every historical period is
month-aligned, so monthly totals still reconcile against the Summary's Paid Ads
column ($4,183.04 in 2025, $1,618.79 in 2026).

Worth knowing: historical ad rows are period aggregates, not individual charges.
Anything comparing ad spend at finer than monthly grain should exclude
pre-go-live data.

### 7.5 The 1,759 free backlinks are out of scope

Only 1,003 of 2,762 backlink rows cost money. The rest are free placements with
real SEO value — DA, traffic, live link, target keyword, Semrush/Search Console
detection — but no expense.

Importing them would mean 1,759 zero-value rows distorting every count and
average. They belong in a **backlink register**, a separate and larger module.
For now: import only paid rows; the workbook stays the register. Duplicate
warnings (§6.3) mean re-entering a link later is a soft collision, not a
problem.

---

## 8. Development phases

Each phase is independently shippable and leaves the module working. **Phase 3
is the milestone that retires the weekly spreadsheet update** — everything after
it is reporting and convenience.

### Phase 1 — Data foundation
*No UI. Nothing user-visible changes.*

- `supabase/migrations/072_expenses.sql`: 5 lookup tables + seeds,
  `expense_subscriptions`, `expenses`, enums, generated `total_usd` and
  `link_domain`, indexes, `expense_monthly_totals` view
- RLS on all tables via `has_module_access('expenses')`; no DELETE policy
- `lib/api.ts`: `requireExpenseDeleter()`
- `types/index.ts`: `Expense`, `ExpenseSubscription`, lookup types, enums

**Done when:** migration applies cleanly, lookups are seeded, and a manual
`INSERT` of one expense row produces the right `total_usd` and `link_domain`.

### Phase 2 — Read-only ledger
*First visible slice; proves the schema before building write paths.*

- `GET /api/expenses` — pagination, filters (month, category, team, vertical, vendor, status), search, sort
- `GET /api/expenses/lookups` — all five lookups in one call
- `/expenses/ledger` — table, filter bar, empty state, running total for the filtered set

**Done when:** rows inserted by hand in Phase 1 are visible and filterable.

### Phase 3 — Create + edit *(the spreadsheet replacement)*
- `POST /api/expenses`, `PATCH /api/expenses/[id]` — Zod validation (`zod` is already a dependency)
- Category-driven entry form (§6.2) with vendor autocomplete and "save and add another"
- `POST /api/expenses/vendors` — add a vendor inline

**Done when:** the dedicated person can enter a full week of expenses without
touching Excel. **This is the go-live gate.**

### Phase 4 — Duplicate warning + soft delete
- `GET /api/expenses/duplicates` — exact-link and domain tiers (§6.3)
- Non-blocking warning panel in the form, showing matching rows inline
- `DELETE /api/expenses/[id]` — soft delete, `requireExpenseDeleter()`
- `POST /api/expenses/[id]/restore` + owner-only "Deleted records" view

**Done when:** a duplicate link warns and still saves; a non-owner gets a 404 on
delete; a deleted row disappears from totals and can be restored.

### Phase 5 — Dashboard core
- `GET /api/expenses/summary` — month × category matrix, KPIs, trend series
- `/expenses` — KPI row, matrix with year selector, 12-month trend
- Ex-tax / inc-tax toggle

**Done when:** the matrix for a chosen year matches hand-checked figures.

### Phase 6 — Dashboard breakdowns
- Spend by team, spend by vertical, top 10 vendors
- Negotiated-savings panel (§2.3)
- MoM / YoY comparison toggle
- Backlink-type breakdown for link categories

**Done when:** every widget in §6.1 is present and agrees with the ledger.

### Phase 7 — Subscriptions
- `GET/POST/PATCH /api/expenses/subscriptions`
- `/expenses/subscriptions` — registry table, status filters, renewal dates
- **Log a charge** action (§6.4)
- Upcoming-renewals widget on the dashboard (next 60 days) flagging overdue

**Done when:** a subscription can be logged as a charge in two clicks and the
new row appears in the ledger with `subscription_id` set.

### Phase 8 — Backfill all four years
- One-off script: the six steps in §7.2, with the explicit date-format list and
  a hard failure on unparseable dates
- Duplicate detection in report-only mode
- **Reconciliation harness** comparing every month × category cell against the
  `Summary` sheet — §7.3 is the pass condition

**Bulk-insert gotcha, found while testing Phase 2.** PostgREST takes the union
of keys across a batch and sends an explicit `NULL` for any key a given row
omits — which bypasses the column `DEFAULT` and trips
`meta jsonb NOT NULL DEFAULT '{}'`. Since expense rows are heterogeneous by
category, nearly every batch hits this. Pass `defaultToNull: false`:

```ts
db.from('expenses').insert(rows, { defaultToNull: false })
```

**Done when:** the reconciliation script reports only the $60.00 and 50¢
variances. Anything else blocks the phase.

### Phase 9 — Settings + export
- `/expenses/settings` — manage lookups (owner-only), Module Access panel moved here off `/expenses`
- XLSX export of the filtered ledger (`xlsx` already a dependency)

**Done when:** lookups are editable without SQL and a filtered export opens in
Excel with the same totals shown on screen.

### Sequencing notes

- Phases 1 → 2 → 3 are strictly ordered. **Ship after 3.**
- Phase 4 should follow 3 closely — editing without a delete path means
  mistakes accumulate.
- Phases 5–7 are independent of each other; reorder by what you want to see first.
- Phase 8 can run any time after Phase 1, but is most useful after Phase 5 —
  the dashboard is how you would actually spot a bad import.

---

## 8b. What Phase 8 actually delivered

`scripts/import-expenses.js` (+ `scripts/lib-xlsx-import.js`) and
`scripts/reconcile-expenses.js`. **1,295 expense rows and 61 subscriptions**
imported, $97,085.92 total.

Re-runnable: every row carries `meta.import_batch`, so `--wipe` reverses the run
completely and `--dry-run` reports without writing.

**Date formats found in the wild — six more than the plan predicted.** The
hard-failure design (report, never silently skip) is what surfaced them:
`17 June 2025`, `10 July, 2025`, `9/30/2025`, `23 Sep`, `Sept 02`, blank.
Slash dates are only resolved when one number exceeds 12; a genuinely ambiguous
`5/6/2025` is reported rather than guessed, because this workbook contains both
US M/D and day-first D/M.

**Nine rows carry no year** (`14 Nov`, `5 Dec`). The year is carried forward from
earlier rows in the same sheet and flagged in the run report. Two of the three
affected months corroborate the inference against the Summary to within rounding
— Nov: $243.75 vs $244.00, Dec: $262.50 vs $263.00 — which is why it is trusted
for September too, where the Summary is simply incomplete.

**Three rows have no date at all** and are not imported (Content Writers row 343,
Courses rows 163 and 167, ~$69 combined). Adding a date in the sheet and
re-running picks them up.

## 9b. Two bugs Phase 8 exposed that only appear at volume

Both were in code that passed every Phase 2 test against 12 rows.

1. **Footer totals silently under-reported.** PostgREST caps an unbounded select
   at 1,000 rows, so the totals query summed only the first 1,000 — the ledger
   showed **$79,984.49** against a true **$97,085.92**, with nothing in the
   response indicating rows had been dropped. Now fetched in explicit 1,000-row
   chunks.
2. **A page past the end returned an error.** PostgREST answers an out-of-range
   request with `"Requested range not satisfiable"` rather than an empty page —
   reachable by sitting on page 40 and applying a narrow filter, or deleting the
   last row of the last page. The API now clamps the page and returns it so the
   client can follow.

## 8c. What Phase 5 delivered

`GET /api/expenses/summary` + `DashboardClient` / `SpendTrend` / `CategoryMatrix`
on `/expenses`.

**Forms chosen by the data's job, not by taste** (the `dataviz` method):
- KPI row → **stat tiles**, not a bar chart. Proportional figures; the delta is an
  arrow plus a named period in secondary ink, deliberately *not* green/red — on a
  spend dashboard "up" is not inherently bad, and a planned campaign month should
  not be coloured like a failure.
- Month × category → a **heatmap grid** on one hue. Nine categories is past the
  ~7 colour-class limit, so it is a table with sequential shading and every figure
  readable as text; the shading assists scanning rather than carrying the value.
- 12-month trend → a **single-series line**, so no legend box (the heading names
  what is plotted), one direct label on the endpoint, and a crosshair + tooltip.

**Palette was computed, not eyeballed.** The blue ordinal ramp was run through
`validate_palette.js --ordinal` against **this app's own surfaces**
(`#ffffff` / `#111827`, not the skill's defaults) — all four gates pass in both
modes. Zero-value cells get no fill at all, so nothing reads as something, and
every *visible* step clears 2:1.

### Three bugs the render caught

Looking at the output, not just shipping it:

1. **The axis top could fall below the data.** The tick generator stopped at the
   last tick ≤ max, so a $6,192 peak drew above a $6k axis. Now runs past max,
   and picks the step giving the tightest sensible axis ($7.5k, not $8k).
2. **The one direct label rounded misleadingly** — $1,476 rendered as "$1k".
   The labelled value is now exact and unabbreviated, with a measured
   fits-or-flips check so it can never be clipped.
3. **Dark mode never applied.** The tokens were set as an inline `style`
   attribute, and inline custom properties outrank every selector, so the
   `.dark` overrides were dead: bright gridlines, invisible endpoint label, white
   marker rings on a dark surface. Tokens now live in the stylesheet.

### One design correction

The year control sits in the filter row above every card, but initially scoped
only the matrix — the exact "filters must scope everything below them"
inconsistency. Selecting a year now re-slices the whole view: KPIs anchor to the
latest month with data *in that year*, the trend window ends there, and the
label switches between "2026 to date" and "2025 total" accordingly.

## 8d. What Phase 6 delivered

`GET /api/expenses/breakdowns` + `BreakdownBars` / `SavingsPanel`, and a
prior-year overlay on the trend.

- **Spend by team**, **by vertical**, **top counterparties**, **link spend by
  type** — horizontal bars, one series on one colour. A darker-where-bigger ramp
  would double-encode bar length as hue.
- **Savings against asking price** — a dumbbell per counterparty (before → after
  is one hue in two shades, not two hues).
- **Compare with a year earlier** — a second line on the *same* axis. Two series,
  so the legend becomes mandatory.

Aggregates are disabled on this Supabase instance, so rows are fetched in
explicit 1,000-row chunks and grouped in the route. Fine at ~1,300 rows; swap for
a SQL view or RPC past six figures.

### Three findings the real data forced

1. **"Negotiated savings" was conflating two different things.** 50 rows across
   four years have an asking price and $0 paid — the source marks them `Free`
   with Payment Type `Link Exchange`. A site asked $1,499 and took a link swap
   instead. Reporting that as a discount inflated 2024 to *"$15,019 saved, 42.4%
   off"*. Split, the honest picture is **$11,539 negotiated down (36.1%)** plus
   **$3,480 avoided entirely** through barter. The importer now marks those rows
   `free` rather than `paid`.
2. **Vendor is the wrong key for link spend.** Backlink rows deliberately carry
   no `vendor_id` — the publisher lives in `link_domain` — so grouping by vendor
   put 91% of 2024 in one "Unassigned" bar and left the savings panel with a
   single useless row. Both now group by *counterparty*: vendor name, falling
   back to the publisher domain.
3. **Vertical genuinely is mostly unattributed** in tool-heavy years (97% of
   2026), because vertical is only recorded on link and content spend. Left
   visible rather than filtered out — that it is unattributed is the fact — with
   the subtitle saying why.

### The savings panel started as a dumbbell and that was wrong

`choosing-a-form` lists a dumbbell for "before → after per item", so that is
what was built first — and on screen it did not communicate. With no axis behind
it the two dot positions carried no meaning, and the connector read like a
progress bar filling the wrong way.

Replaced with a **stacked bar from a shared zero baseline**: paid + saved =
asked, split by a 2px surface gap. Now the bar's total length is the ask, the
pale tail *is* the saving, and rows are directly comparable because they all
start at zero. A dumbbell shows an interval; here both numbers are magnitudes
from zero, which is what makes the stacked form the honest one.

Segment shades are steps 450 and 250 of the blue ramp. Step 200 was the first
choice and failed the light-surface floor at 1.79:1 — the validator caught it;
250 is the lightest step that clears 2:1 on white.

## 8e. What Phase 7 delivered

`GET/POST /api/expenses/subscriptions`, `PATCH/DELETE .../[id]`,
`/expenses/subscriptions`, and a renewals widget on the dashboard. The 61
imported subscriptions were previously invisible in the app.

- **Registry** — 44 active / 17 cancelled, sorted by renewal date, with
  **$24,880 committed per year**. That figure is monthly × 12 plus yearly and
  says so: credits and one-time rows have no annual equivalent and are excluded
  rather than folded in at zero.
- **Log a charge** — pre-fills the expense form from the commitment (vendor,
  team, per-cycle price, category, invoice URL) with `subscription_id` set.
  Nothing is written until saved, and nothing is ever generated on a schedule
  (decision 4). `subscription_id` is deliberately *not* carried across
  "save and add another" — the next entry is a different charge.
- **Charge history per subscription** — last charge date, count and total, so
  "renewed but never charged" is visible. A renewal date alone cannot tell you
  whether the money actually went out.
- **Renewals widget** — active only, within 60 days or already overdue.

The bug flagged at the end of Phase 8 is fixed: of the six subscriptions
renewing within 90 days, two (Yoast, Framer Imperium) are **cancelled**. The
widget filters to `status=active`, so it shows four. Nagging about something you
have already stopped paying for teaches people to ignore the widget.

`is_overdue` is likewise computed only for active rows — a cancelled
subscription passing its date is expected, not a problem.

## 8f. What Phase 9 delivered

`/expenses/settings` with lookup management and the Module Access panel (moved
off the dashboard — it is administration, not reporting), plus XLSX export of
the ledger.

- **Lookups** — add, rename, retire, restore across all five tables, with live
  counts. Vendors are addable by any grant holder; the other four are the
  owner's alone, and renaming or retiring anything is owner-only because it
  changes reporting for everyone.
- **No delete, only retire.** A lookup with history behind it must keep
  resolving; deleting a vendor would blank it on every expense pointing at it.
- **Export** — an `<a>` carrying the ledger's own query string, so the file is
  exactly what is on screen including the sort. 24 columns with names resolved
  rather than UUIDs, auto-filter and column widths set.

`applyExpenseFilters` was extracted to `lib/expenses.ts` and is now shared by the
listing and the export. "Export what I am looking at" is a promise, and two
copies of that logic would eventually break it silently.

Verified by downloading and parsing the file, not just checking headers: the
2023 export holds **202 rows summing to $17,355.87** — matching the database row
count and the Summary sheet's 2023 total exactly. A `status=free` export holds
50 rows, $0.00 paid against $12,647 of asking prices.

### Two importer bugs this phase surfaced

Both were silent, and both were mine.

1. **The seed's typo correction broke vendor matching.** Migration 072 seeds
   "Zoho Campaigns", correcting the source's "Zoho Campagins". Case-insensitive
   matching handles a case difference but not a *typo*, so the importer found no
   match and created the misspelling as an 86th vendor — reintroducing the exact
   duplicate-name problem the lookup tables exist to prevent. Fixed with an
   explicit alias map in `lib-xlsx-import.js`.
2. **`--wipe` left subscriptions behind.** It deleted by
   `notes = 'import:xlsx-v1'` exactly, but rows carrying a source comment were
   tagged `import:xlsx-v1\n<comment>`. Those survived every wipe and each re-run
   stacked another 61 on top — the registry had reached **105**. Now matched
   with `like('import:xlsx-v1%')`.

After both fixes and a clean re-import: 1,295 expenses, 61 subscriptions
(61 unique names), 85 vendors, reconciliation still 86 exact / 0 unexplained.

## 10. Credits — done (migration 074)

`amount_usd >= 0` could not represent a credit, so the one −$20.49 row in four
years had to be clamped to $0 and refunds would have overstated spend forever
after. Migration 074 relaxes the bound symmetrically (±$1M) and the zod schema
matches.

`payment_status` is now descriptive — what happened — and `amount_usd` carries
the sign, which way the money moved. A refund is a negative row and nets off its
month. Applied, re-imported and reconciled: 86 cells exact, 0 unexplained.

## 9. Remaining open questions

1. **Go-live month for manual entry.** Phase 3 ships before the Phase 8
   backfill, so entry starts from a chosen month while history arrives later.
   Which month?
2. **Ownership of the backlinks register.** Paid rows will live in both the
   module and the workbook. Duplicate warnings make that safe, but it is still
   double entry — worth deciding whether the module eventually absorbs the full
   register (§7.5).
3. **Tax rate defaults.** `tax_usd` is a free amount per row. If tax is a
   consistent percentage for certain vendors, a default rate per vendor would
   save typing — say if that is worth having.
