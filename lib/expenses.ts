import { z } from 'zod'

// Shared validation for the expenses module. Kept out of the route files so the
// create and patch schemas cannot drift apart, and so the field list has one
// home when a new column is added.

const uuid = z.string().uuid()
// Non-negative money: tax, and the pre-negotiation ask.
const money = z.number().min(0).max(1_000_000)
// `amount_usd` may be negative — a credit or refund is a negative row so it nets
// off the month's spend (migration 074). Bounds mirror the DB CHECK.
const signedMoney = z.number().min(-1_000_000).max(1_000_000)
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

// Trims, then turns '' into null. Text columns in this module treat empty and
// absent as the same thing — a blank form field must not store a whitespace
// string that then fails to match any filter.
const blankToNull = (max: number) =>
  z.string().trim().max(max).transform(v => (v === '' ? null : v)).nullable().optional()

export const PAYMENT_STATUSES = ['paid', 'pending', 'refunded', 'free'] as const
export const PAYMENT_METHODS = ['auto_pay', 'manual', 'link_exchange'] as const
export const LINK_RELS = ['dofollow', 'nofollow', 'text_mention'] as const

// Mirrors the DB CHECK (expense_date >= 2015-01-01) so the caller gets a field
// error instead of a raw constraint violation. The upper bound cannot live in
// SQL — a CHECK may not call now() — so it is enforced only here: a year's grace
// for prepaid invoices, which still catches a fat-fingered 2062.
const MIN_DATE = '2015-01-01'
function maxDate(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

const baseFields = {
  expense_date: dateOnly,
  amount_usd: signedMoney,
  tax_usd: money.nullable().optional(),
  initial_price_usd: money.nullable().optional(),

  category_id: uuid,
  backlink_type_id: uuid.nullable().optional(),
  vendor_id: uuid.nullable().optional(),
  subscription_id: uuid.nullable().optional(),
  team_id: uuid.nullable().optional(),
  vertical_id: uuid.nullable().optional(),

  link_url: blankToNull(2000),
  link_site: blankToNull(2000),
  link_rel: z.enum(LINK_RELS).nullable().optional(),

  payee: blankToNull(200),
  acquired_by: blankToNull(200),
  country: blankToNull(100),

  payment_status: z.enum(PAYMENT_STATUSES).default('paid'),
  payment_method: z.enum(PAYMENT_METHODS).nullable().optional(),
  invoice_url: blankToNull(2000),
  description: blankToNull(1000),
  notes: blankToNull(5000),

  // Category-specific long tail. Values are free-form but never credentials —
  // see expenses.md §3.4.
  meta: z.record(z.string(), z.unknown()).default({}),
}

function withDateBounds<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((val, ctx) => {
    const d = (val as { expense_date?: string }).expense_date
    if (!d) return
    if (d < MIN_DATE) {
      ctx.addIssue({ code: 'custom', path: ['expense_date'], message: `Date cannot be before ${MIN_DATE}` })
    } else if (d > maxDate()) {
      ctx.addIssue({ code: 'custom', path: ['expense_date'], message: 'Date is more than a year in the future — check the year' })
    }
  })
}

export const expenseCreateSchema = withDateBounds(z.object(baseFields))

// Every field optional, but the same rules apply to whatever is present.
// `category_id` cannot be nulled out — it is NOT NULL in the database.
export const expensePatchSchema = withDateBounds(
  z.object({
    ...baseFields,
    expense_date: dateOnly.optional(),
    amount_usd: signedMoney.optional(),
    category_id: uuid.optional(),
    payment_status: z.enum(PAYMENT_STATUSES).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  }),
)

export const vendorCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
})

// ─── Subscriptions — the commitments registry ─────────────────────────────────
export const BILLING_CYCLES = ['monthly', 'yearly', 'credits', 'one_time', 'custom'] as const
export const SUBSCRIPTION_STATUSES = ['active', 'cancelled', 'expired'] as const

const subscriptionFields = {
  name: z.string().trim().min(1, 'Name is required').max(200),
  vendor_id: uuid.nullable().optional(),
  billing_cycle: z.enum(BILLING_CYCLES),
  // Price PER CYCLE, never a running total — summing this across rows with
  // different cycles is the mistake the source spreadsheet invites.
  amount_usd: money.nullable().optional(),
  started_on: dateOnly.nullable().optional(),
  ends_on: dateOnly.nullable().optional(),
  payment_method: z.enum(PAYMENT_METHODS).nullable().optional(),
  status: z.enum(SUBSCRIPTION_STATUSES).default('active'),
  owner_profile_id: uuid.nullable().optional(),
  // Free text for owners who are not platform users — the source has "Tech Team"
  // and "Vrisha Mam".
  owner_name: blankToNull(200),
  team_id: uuid.nullable().optional(),
  seats: z.number().int().min(1).max(10_000).nullable().optional(),
  invoice_url: blankToNull(2000),
  notes: blankToNull(5000),
}

// Mirrors the DB constraint expense_subscriptions_dates_ordered so the caller
// gets a field error rather than a raw constraint violation.
function withOrderedDates<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((val, ctx) => {
    const v = val as { started_on?: string | null; ends_on?: string | null }
    if (v.started_on && v.ends_on && v.ends_on < v.started_on) {
      ctx.addIssue({ code: 'custom', path: ['ends_on'], message: 'Renewal date cannot be before the start date' })
    }
  })
}

export const subscriptionCreateSchema = withOrderedDates(z.object(subscriptionFields))

export const subscriptionPatchSchema = withOrderedDates(
  z.object({
    ...subscriptionFields,
    name: z.string().trim().min(1).max(200).optional(),
    billing_cycle: z.enum(BILLING_CYCLES).optional(),
    status: z.enum(SUBSCRIPTION_STATUSES).optional(),
  }),
)

// Turns a ZodError into { error, fields }. The rest of this codebase returns
// `error: parsed.error.flatten()` — an object — but the expenses clients render
// `error` directly as text, so a string here avoids "[object Object]" in the UI
// while `fields` keeps the per-field detail for inline messages.
export function validationResponse(error: z.ZodError): { error: string; fields: Record<string, string[]> } {
  const fields: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_'
    fields[key] = [...(fields[key] ?? []), issue.message]
  }
  const first = error.issues[0]
  const label = first?.path.length ? `${first.path.join('.')}: ` : ''
  return { error: `${label}${first?.message ?? 'Invalid input'}`, fields }
}

// Categories whose rows describe an acquired link. Used by the API to decide
// whether link fields are meaningful and by the form to show that section.
export const LINK_CATEGORY_SLUGS = ['paid-links', 'haro-links'] as const

// The managed lookups. All five are maintained by ledger managers as well as the
// owner: the person entering expenses every week is the one who discovers a
// missing vendor or link type, and routing that through the owner would stall
// data entry for no safety gain — nothing here can be deleted, only retired.
export const LOOKUP_TABLES: Record<string, { table: string; label: string; hasSlug?: boolean }> = {
  categories:    { table: 'expense_categories',     label: 'Categories', hasSlug: true },
  teams:         { table: 'expense_teams',          label: 'Teams' },
  verticals:     { table: 'expense_verticals',      label: 'Verticals' },
  backlinkTypes: { table: 'expense_backlink_types', label: 'Link types' },
  vendors:       { table: 'expense_vendors',        label: 'Vendors' },
}

// ─── Shared ledger filtering ──────────────────────────────────────────────────
// Lives here, not in the route, because the ledger listing and the XLSX export
// must resolve to exactly the same rows. "Export what I am looking at" is a
// promise; two copies of this logic would eventually break it silently.

export const EXPENSE_SORTABLE = new Set(['expense_date', 'amount_usd', 'total_usd', 'created_at', 'updated_at'])

// Text columns the free-text box searches. Vendor/team/vertical are joins and
// get their own dropdowns instead.
const SEARCH_COLUMNS = ['description', 'notes', 'payee', 'acquired_by', 'link_url', 'link_site', 'country']

const FILTER_COLUMNS = [
  ['category', 'category_id'],
  ['team', 'team_id'],
  ['vertical', 'vertical_id'],
  ['vendor', 'vendor_id'],
  ['backlinkType', 'backlink_type_id'],
  ['subscription', 'subscription_id'],
] as const

export function applyExpenseFilters<T>(query: T, sp: URLSearchParams, opts: { deleted?: boolean } = {}): T {
  // The PostgREST builder's chained return types are impractical to thread
  // through a generic helper. Safety comes from the whitelists here — the enum
  // sets and the regex-validated dates — not from the typing.
  let b = query as any
  b = opts.deleted ? b.not('deleted_at', 'is', null) : b.is('deleted_at', null)

  // month=YYYY-MM is the common case; year, or from/to, allow anything else.
  const month = sp.get('month')
  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    const [y, m] = month.split('-').map(Number)
    const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1))
    b = b.gte('expense_date', `${month}-01`).lt('expense_date', end.toISOString().slice(0, 10))
  } else {
    const year = sp.get('year')
    if (year && /^\d{4}$/.test(year)) {
      b = b.gte('expense_date', `${year}-01-01`).lt('expense_date', `${Number(year) + 1}-01-01`)
    }
    const from = sp.get('from')
    const to = sp.get('to')
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) b = b.gte('expense_date', from)
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) b = b.lte('expense_date', to)
  }

  for (const [param, column] of FILTER_COLUMNS) {
    const v = sp.get(param)
    if (v) b = b.eq(column, v)
  }

  const status = sp.get('status')
  if (status && (PAYMENT_STATUSES as readonly string[]).includes(status)) {
    b = b.eq('payment_status', status)
  }

  const search = sp.get('q')?.trim()
  if (search) {
    // Strip PostgREST's `or` delimiters and the LIKE wildcards, so neither a
    // comma nor a stray % can escape the filter expression or over-match.
    const safe = search.replace(/[(),*%_]/g, ' ').trim()
    if (safe) b = b.or(SEARCH_COLUMNS.map(c => `${c}.ilike.*${safe}*`).join(','))
  }

  return b as T
}

// Foreign-key and check violations otherwise reach the UI as raw Postgres text.
export function friendlyDbError(e: { code?: string; message: string }): string {
  if (e.code === '23503') return 'One of the selected options no longer exists — reload and try again.'
  if (e.code === '23514') return 'A value is out of range for this field.'
  if (e.code === '22P02') return 'A value has the wrong format.'
  if (e.code === '23502') return 'A required field was missing.'
  return e.message
}
