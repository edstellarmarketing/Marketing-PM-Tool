import { createAdminClient } from '@/lib/supabase/admin'
import { RENEWAL_URGENT_DAYS, publicReportPath } from '@/lib/expense-constants'
import { applyExpenseFilters } from '@/lib/expenses'

// Shared reporting data for the public report page and the weekly email, so the
// two can never quote different numbers for the same period.
//
// Everything here runs on the service-role client because the public page has no
// session at all. That makes each function its own authorization boundary: only
// return what the caller is allowed to publish.

const CHUNK = 1000

export const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
export const usd2 = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

export function formatDay(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// IST is the team's working timezone; every other digest in this app anchors to
// it, so the week boundaries match what people expect.
export function istToday(): Date {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000)
}

// The 7 days ending yesterday, matching how the team already reports
// ("July 03 – July 10").
export function lastWeekRange(): { start: string; end: string } {
  const today = istToday()
  const end = new Date(today); end.setUTCDate(end.getUTCDate() - 1)
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 6)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

/**
 * Strip the backfill's bookkeeping tag out of a note before showing it.
 * Imported rows carry `import:xlsx-v1`, sometimes followed by the real comment
 * from the spreadsheet. "import:xlsx-v1 2 users" means nothing to a reader of
 * the report — "2 users" does.
 */
export function cleanNote(note: string | null): string | null {
  if (!note) return null
  const stripped = note.replace(/^import:[\w.-]+[ \t]*\r?\n?/i, '').trim()
  return stripped || null
}

type Db = ReturnType<typeof createAdminClient>

async function lookupNames(db: Db, table: string): Promise<Map<string, string>> {
  const { data } = await db.from(table).select('id, name')
  return new Map(((data ?? []) as { id: string; name: string }[]).map(r => [r.id, r.name]))
}

// PostgREST caps an unbounded select at 1,000 rows silently, so every read here
// pages explicitly.
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; ; offset += CHUNK) {
    const { data, error } = await build(offset, offset + CHUNK - 1)
    if (error) throw new Error(String((error as { message?: string }).message ?? error))
    const batch = (data ?? []) as T[]
    out.push(...batch)
    if (batch.length < CHUNK) break
  }
  return out
}

// ── Public report ────────────────────────────────────────────────────────────
// Served without a login: the token in the URL is the only credential. By
// explicit instruction this now publishes the full report — every year, and the
// ledger and subscriptions read-only — so anyone holding the URL sees what a
// viewer sees, minus Settings.
//
// The one line that does NOT move: no credentials. The importer drops the
// workbooks' Mail Id / Password / User Name columns, so there are none in this
// data to expose. Never add a column that carries them.

// ── Public: every year, not just the latest ──────────────────────────────────
export interface PublicYear {
  year: number
  yearTotal: number
  monthsWithData: number
  /** Aligned to `categories`, so a table can render rows without a lookup. */
  categoryCells: number[]
  matrix: { month: number; cells: number[]; total: number }[]
}

export interface PublicOverview {
  generatedAt: string
  years: number[]
  categories: string[]
  perYear: PublicYear[]
  categoryTotals: { name: string; total: number }[]
  allTimeTotal: number
  entryCount: number
}

export async function getPublicOverview(): Promise<PublicOverview | null> {
  const db = createAdminClient()

  // The view is one row per year/month/category. Small enough to hold whole even
  // after several years, but paged anyway — the 1,000-row cap applies here too
  // and 4 years x 12 months x 9 categories is already within range of it.
  const rows = await fetchAll<{
    year: number; month: number; category_name: string
    category_sort_order: number; total_usd: string | number; entry_count: number
  }>((from, to) =>
    db.from('expense_monthly_totals')
      .select('year, month, category_name, category_sort_order, total_usd, entry_count')
      .range(from, to))

  if (rows.length === 0) return null

  const years = [...new Set(rows.map(r => r.year))].sort((a, b) => b - a) // newest first
  const categories = [...new Map(rows.map(r => [r.category_name, r.category_sort_order])).entries()]
    .sort((a, b) => a[1] - b[1]).map(([name]) => name)

  const cell = new Map<string, number>()
  for (const r of rows) cell.set(`${r.year}-${r.month}|${r.category_name}`, Number(r.total_usd))

  const perYear: PublicYear[] = years.map(year => {
    const matrix = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1
      const cells = categories.map(c => cell.get(`${year}-${month}|${c}`) ?? 0)
      return { month, cells, total: cells.reduce((a, b) => a + b, 0) }
    })
    return {
      year,
      matrix,
      yearTotal: matrix.reduce((a, r) => a + r.total, 0),
      monthsWithData: matrix.filter(m => m.total !== 0).length,
      categoryCells: categories.map((_, i) => matrix.reduce((a, r) => a + r.cells[i], 0)),
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    years,
    categories,
    perYear,
    categoryTotals: categories
      .map((name, i) => ({ name, total: perYear.reduce((a, y) => a + y.categoryCells[i], 0) }))
      .filter(c => c.total !== 0)
      .sort((a, b) => b.total - a.total),
    allTimeTotal: rows.reduce((a, r) => a + Number(r.total_usd), 0),
    entryCount: rows.reduce((a, r) => a + Number(r.entry_count ?? 0), 0),
  }
}

// ── Public: ledger, read-only ────────────────────────────────────────────────
export interface PublicLedgerRow {
  id: string
  expense_date: string
  category: string | null
  description: string | null
  vendor: string | null
  team: string | null
  vertical: string | null
  backlink_type: string | null
  link_url: string | null
  link_domain: string | null
  da: number | null
  payment_status: string
  payment_method: string | null
  payee: string | null
  acquired_by: string | null
  country: string | null
  amount_usd: number
  tax_usd: number
  total_usd: number
  initial_price_usd: number | null
  invoice_url: string | null
  notes: string | null
}

export interface PublicLedgerPage {
  rows: PublicLedgerRow[]
  page: number
  pageSize: number
  total: number
  lastPage: number
  /** Totals for the whole filtered set, not just the visible page. */
  sumTotal: number
  sumTax: number
}

const LEDGER_SELECT = `id, expense_date, description, payment_status, payment_method,
  payee, acquired_by, country,
  amount_usd, tax_usd, total_usd, initial_price_usd, invoice_url, notes,
  link_url, link_domain, meta,
  category_id, vendor_id, team_id, vertical_id, backlink_type_id`

interface RawLedgerRow {
  id: string; expense_date: string; description: string | null
  payment_status: string; payment_method: string | null
  payee: string | null; acquired_by: string | null; country: string | null
  amount_usd: string | number; tax_usd: string | number | null; total_usd: string | number
  initial_price_usd: string | number | null; invoice_url: string | null; notes: string | null
  link_url: string | null; link_domain: string | null; meta: Record<string, unknown> | null
  category_id: string | null; vendor_id: string | null; team_id: string | null
  vertical_id: string | null; backlink_type_id: string | null
}

export async function getPublicLedger(
  sp: URLSearchParams,
  opts: { page?: number; pageSize?: number } = {},
): Promise<PublicLedgerPage> {
  const db = createAdminClient()
  const pageSize = Math.min(200, Math.max(10, opts.pageSize ?? 50))
  const wanted = Math.max(1, opts.page ?? 1)

  // Same filter helper the in-app ledger and the XLSX export use, so a given set
  // of filters always means the same set of rows. `deleted` is never honoured
  // here — the recycle bin stays out of the public view.
  const applyFilters = <T,>(q: T): T => applyExpenseFilters(q, sp, { deleted: false })

  // Totals across the whole filtered set. Chunked: an unbounded select silently
  // stops at 1,000 rows, which would under-report the footer.
  const sums: { tax_usd: string | number | null; total_usd: string | number }[] = []
  let total = 0
  for (let offset = 0; ; offset += CHUNK) {
    const { data, count, error } = await applyFilters(
      db.from('expenses').select('tax_usd, total_usd', { count: 'exact' }),
    ).range(offset, offset + CHUNK - 1)
    if (error) throw new Error(error.message)
    if (offset === 0) total = count ?? 0
    sums.push(...((data ?? []) as typeof sums))
    if (sums.length >= total || (data ?? []).length === 0) break
  }

  // A range past the end is an error from PostgREST, not an empty page, so clamp.
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(wanted, lastPage)

  const raw = total === 0 ? [] : await (async () => {
    const { data, error } = await applyFilters(db.from('expenses').select(LEDGER_SELECT))
      .order('expense_date', { ascending: false })
      .order('id', { ascending: false }) // stable tiebreak, else pages can repeat a row
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (error) throw new Error(error.message)
    return (data ?? []) as unknown as RawLedgerRow[]
  })()

  const [cats, teams, verticals, vendors, blTypes] = await Promise.all([
    lookupNames(db, 'expense_categories'),
    lookupNames(db, 'expense_teams'),
    lookupNames(db, 'expense_verticals'),
    lookupNames(db, 'expense_vendors'),
    lookupNames(db, 'expense_backlink_types'),
  ])
  const n = (v: string | number | null) => Number(v ?? 0)

  return {
    rows: raw.map(r => ({
      id: r.id,
      expense_date: r.expense_date,
      category: cats.get(r.category_id ?? '') ?? null,
      description: r.description,
      vendor: vendors.get(r.vendor_id ?? '') ?? null,
      team: teams.get(r.team_id ?? '') ?? null,
      vertical: verticals.get(r.vertical_id ?? '') ?? null,
      backlink_type: blTypes.get(r.backlink_type_id ?? '') ?? null,
      link_url: r.link_url,
      link_domain: r.link_domain || null,
      da: typeof r.meta?.da === 'number' ? (r.meta.da as number) : null,
      payment_status: r.payment_status,
      payment_method: r.payment_method,
      payee: r.payee,
      acquired_by: r.acquired_by,
      country: r.country,
      amount_usd: n(r.amount_usd),
      tax_usd: n(r.tax_usd),
      total_usd: n(r.total_usd),
      initial_price_usd: r.initial_price_usd === null ? null : n(r.initial_price_usd),
      invoice_url: r.invoice_url,
      notes: cleanNote(r.notes),
    })),
    page, pageSize, total, lastPage,
    sumTotal: sums.reduce((a, r) => a + n(r.total_usd), 0),
    sumTax: sums.reduce((a, r) => a + n(r.tax_usd), 0),
  }
}

// ── Public: subscriptions, read-only ─────────────────────────────────────────
export interface PublicSubscriptionRow {
  id: string
  name: string
  vendor: string | null
  team: string | null
  owner: string | null
  amount_usd: number | null
  billing_cycle: string | null
  seats: number | null
  payment_method: string | null
  started_on: string | null
  ends_on: string | null
  status: string
  is_active: boolean
  daysUntil: number | null
  invoice_url: string | null
  notes: string | null
}

export async function getPublicSubscriptions(): Promise<PublicSubscriptionRow[]> {
  const db = createAdminClient()
  const rows = await fetchAll<{
    id: string; name: string; amount_usd: string | number | null
    billing_cycle: string | null; started_on: string | null; ends_on: string | null
    status: string; notes: string | null; seats: number | null
    payment_method: string | null; invoice_url: string | null; owner_name: string | null
    vendor_id: string | null; team_id: string | null
  }>((from, to) =>
    db.from('expense_subscriptions')
      .select(`id, name, amount_usd, billing_cycle, started_on, ends_on, status, notes,
               seats, payment_method, invoice_url, owner_name, vendor_id, team_id`)
      // Soft-deleted subscriptions are gone as far as this page is concerned —
      // the recycle bin is not part of the public report.
      .is('deleted_at', null)
      .order('ends_on', { ascending: true, nullsFirst: false })
      .range(from, to))

  const [teams, vendors] = await Promise.all([
    lookupNames(db, 'expense_teams'),
    lookupNames(db, 'expense_vendors'),
  ])

  const today = istToday().toISOString().slice(0, 10)
  const dayMs = 86_400_000

  const mapped = rows.map(r => ({
    id: r.id,
    name: r.name,
    vendor: vendors.get(r.vendor_id ?? '') ?? null,
    team: teams.get(r.team_id ?? '') ?? null,
    owner: r.owner_name,
    amount_usd: r.amount_usd === null ? null : Number(r.amount_usd),
    billing_cycle: r.billing_cycle,
    seats: r.seats,
    payment_method: r.payment_method,
    started_on: r.started_on,
    ends_on: r.ends_on,
    status: r.status,
    is_active: r.status === 'active',
    daysUntil: r.ends_on
      ? Math.round((Date.parse(`${r.ends_on}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / dayMs)
      : null,
    invoice_url: r.invoice_url,
    notes: cleanNote(r.notes),
  }))

  // Live subscriptions first, soonest renewal at the top — ordering by ends_on
  // alone floats long-cancelled rows with old dates above everything that still
  // matters. Undated rows sort last within their group.
  return mapped.sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
    if (a.daysUntil === null) return b.daysUntil === null ? a.name.localeCompare(b.name) : 1
    if (b.daysUntil === null) return -1
    return a.daysUntil - b.daysUntil
  })
}

/** Filter dropdown options for the public ledger view. */
export async function getPublicFilterOptions() {
  const db = createAdminClient()
  const pick = async (table: string) => {
    const { data } = await db.from(table).select('id, name, is_active').order('name')
    return ((data ?? []) as { id: string; name: string; is_active: boolean }[])
      .filter(r => r.is_active !== false)
  }
  const [categories, teams, verticals, vendors] = await Promise.all([
    pick('expense_categories'), pick('expense_teams'),
    pick('expense_verticals'), pick('expense_vendors'),
  ])
  return { categories, teams, verticals, vendors }
}

export async function resolvePublicToken(token: string): Promise<boolean> {
  if (!token || token.length < 16) return false
  const db = createAdminClient()
  const { data } = await db
    .from('expense_public_report')
    .select('enabled')
    .eq('token', token)
    .maybeSingle()
  return data?.enabled === true
}

export async function getPublicReportUrl(): Promise<string | null> {
  const db = createAdminClient()
  const { data } = await db
    .from('expense_public_report')
    .select('token, enabled')
    .eq('id', true)
    .maybeSingle()
  if (!data?.enabled) return null
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  return `${base}${publicReportPath(data.token)}`
}

// ── Weekly digest ────────────────────────────────────────────────────────────
// Shaped to match how the team already reports the week by hand: a total, tools
// broken down by team, the links acquired, and anything still unpaid.
export interface WeeklyDigest {
  start: string
  end: string
  weekTotal: number
  entryCount: number
  tools: { team: string; items: { name: string; cycle: string | null; amount: number }[]; subtotal: number }[]
  toolsTotal: number
  links: { url: string | null; domain: string | null; da: number | null; type: string | null; amount: number }[]
  linksTotal: number
  otherCategories: { name: string; total: number }[]
  pending: { description: string; domain: string | null; url: string | null; invoice: string | null; amount: number }[]
  pendingTotal: number
  year: number
  yearToDate: number
  yearByCategory: { name: string; total: number }[]
  priorWeekTotal: number
  // What was talked down this week — the team negotiates hard and nothing
  // currently reports it.
  savedThisWeek: number
  askedThisWeek: number
  largest: { name: string; amount: number } | null
}

interface DigestRow {
  expense_date: string
  category_id: string | null
  team_id: string | null
  vendor_id: string | null
  backlink_type_id: string | null
  link_url: string | null
  link_domain: string | null
  invoice_url: string | null
  description: string | null
  payment_status: string
  total_usd: string | number
  initial_price_usd: string | number | null
  meta: Record<string, unknown> | null
}

export async function getWeeklyDigest(start: string, end: string): Promise<WeeklyDigest> {
  const db = createAdminClient()
  const year = Number(end.slice(0, 4))

  const select = `expense_date, category_id, team_id, vendor_id, backlink_type_id, link_url,
                  link_domain, invoice_url, description, payment_status, total_usd,
                  initial_price_usd, meta`

  const week = await fetchAll<DigestRow>((from, to) =>
    db.from('expenses').select(select).is('deleted_at', null)
      .gte('expense_date', start).lte('expense_date', end)
      .order('expense_date').range(from, to))

  const [cats, teams, vendors, blTypes] = await Promise.all([
    lookupNames(db, 'expense_categories'),
    lookupNames(db, 'expense_teams'),
    lookupNames(db, 'expense_vendors'),
    lookupNames(db, 'expense_backlink_types'),
  ])

  const n = (v: string | number | null) => Number(v ?? 0)
  const catName = (r: DigestRow) => cats.get(r.category_id ?? '') ?? 'Uncategorised'

  // Tools & subscriptions, grouped by team — the shape the team already uses.
  const toolRows = week.filter(r => catName(r) === 'Tools / Subscriptions')
  const byTeam = new Map<string, { name: string; cycle: string | null; amount: number }[]>()
  for (const r of toolRows) {
    const team = teams.get(r.team_id ?? '') ?? 'Other'
    const list = byTeam.get(team) ?? []
    list.push({
      name: vendors.get(r.vendor_id ?? '') ?? r.description ?? 'Unnamed',
      cycle: (r.meta?.charge_type as string) ?? null,
      amount: n(r.total_usd),
    })
    byTeam.set(team, list)
  }
  const tools = [...byTeam.entries()]
    .map(([team, items]) => ({
      team,
      items: items.sort((a, b) => b.amount - a.amount),
      subtotal: items.reduce((a, i) => a + i.amount, 0),
    }))
    .sort((a, b) => b.subtotal - a.subtotal)

  // Links acquired — Paid Links and HARO Links.
  const linkRows = week.filter(r => ['Paid Links', 'HARO Links'].includes(catName(r)))
  const links = linkRows.map(r => ({
    url: r.link_url,
    domain: r.link_domain || null,
    da: typeof r.meta?.da === 'number' ? (r.meta.da as number) : null,
    type: blTypes.get(r.backlink_type_id ?? '') ?? null,
    amount: n(r.total_usd),
  })).sort((a, b) => (b.da ?? 0) - (a.da ?? 0))

  const handled = new Set(['Tools / Subscriptions', 'Paid Links', 'HARO Links'])
  const otherMap = new Map<string, number>()
  for (const r of week) {
    const c = catName(r)
    if (handled.has(c)) continue
    otherMap.set(c, (otherMap.get(c) ?? 0) + n(r.total_usd))
  }

  const pending = week.filter(r => r.payment_status === 'pending').map(r => ({
    description: r.description ?? r.link_domain ?? 'Unnamed entry',
    domain: r.link_domain || null,
    url: r.link_url,
    invoice: r.invoice_url,
    // A pending row has no settled amount; the ask is the only figure there is.
    amount: n(r.initial_price_usd) || n(r.total_usd),
  }))

  // Year to date, and the week before, for context. Bounded to months up to the
  // report's own week, so "year so far" means as of this report — a digest for a
  // past week must not quote a total that includes months after it.
  const endMonth = Number(end.slice(5, 7))
  const ytdRows = await fetchAll<{ category_name: string; total_usd: string | number }>((from, to) =>
    db.from('expense_monthly_totals').select('category_name, total_usd')
      .eq('year', year).lte('month', endMonth).range(from, to))
  const yearMap = new Map<string, number>()
  for (const r of ytdRows) yearMap.set(r.category_name, (yearMap.get(r.category_name) ?? 0) + Number(r.total_usd))

  const priorEnd = new Date(`${start}T00:00:00Z`); priorEnd.setUTCDate(priorEnd.getUTCDate() - 1)
  const priorStart = new Date(priorEnd); priorStart.setUTCDate(priorStart.getUTCDate() - 6)
  const priorRows = await fetchAll<{ total_usd: string | number }>((from, to) =>
    db.from('expenses').select('total_usd').is('deleted_at', null)
      .gte('expense_date', priorStart.toISOString().slice(0, 10))
      .lte('expense_date', priorEnd.toISOString().slice(0, 10)).range(from, to))

  // Negotiated down only — rows settled at $0 are barter, not a discount, and
  // folding them in overstates the rate (see expenses.md §8d).
  const negotiated = week.filter(r => n(r.initial_price_usd) > 0 && n(r.total_usd) > 0)
  const askedThisWeek = negotiated.reduce((a, r) => a + n(r.initial_price_usd), 0)
  const paidNegotiated = negotiated.reduce((a, r) => a + n(r.total_usd), 0)

  const largestRow = week.reduce<DigestRow | null>(
    (best, r) => (!best || n(r.total_usd) > n(best.total_usd) ? r : best), null)

  return {
    start, end,
    weekTotal: week.reduce((a, r) => a + n(r.total_usd), 0),
    entryCount: week.length,
    tools,
    toolsTotal: toolRows.reduce((a, r) => a + n(r.total_usd), 0),
    links,
    linksTotal: linkRows.reduce((a, r) => a + n(r.total_usd), 0),
    otherCategories: [...otherMap.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total),
    pending,
    pendingTotal: pending.reduce((a, p) => a + p.amount, 0),
    savedThisWeek: askedThisWeek - paidNegotiated,
    askedThisWeek,
    largest: largestRow && n(largestRow.total_usd) > 0
      ? {
          name: largestRow.description
            ?? vendors.get(largestRow.vendor_id ?? '')
            ?? largestRow.link_domain
            ?? 'Unnamed entry',
          amount: n(largestRow.total_usd),
        }
      : null,
    year,
    yearToDate: [...yearMap.values()].reduce((a, b) => a + b, 0),
    yearByCategory: [...yearMap.entries()].map(([name, total]) => ({ name, total }))
      .filter(c => c.total !== 0).sort((a, b) => b.total - a.total),
    priorWeekTotal: priorRows.reduce((a, r) => a + Number(r.total_usd ?? 0), 0),
  }
}

export interface Renewal {
  id: string
  name: string
  amount_usd: number | null
  ends_on: string | null
  billing_cycle: string
  owner_name: string | null
  daysUntil: number
  urgency: 'overdue' | 'urgent' | 'soon'
}

// Active subscriptions renewing within `days`, or already past.
//
// Cancelled ones are excluded: nagging about something you have already stopped
// paying for teaches people to ignore the alert.
//
// Urgency bands drive both the red highlighting on screen and the alert block in
// the email — overdue and within RENEWAL_URGENT_DAYS demand action now.
export async function getRenewalsDue(days: number): Promise<Renewal[]> {
  const db = createAdminClient()
  const until = new Date(); until.setDate(until.getDate() + days)
  const { data } = await db
    .from('expense_subscriptions')
    .select('id, name, amount_usd, ends_on, billing_cycle, owner_name')
    .is('deleted_at', null)
    .eq('status', 'active')
    .not('ends_on', 'is', null)
    .lte('ends_on', until.toISOString().slice(0, 10))
    .order('ends_on')

  const today = new Date(); today.setHours(0, 0, 0, 0)

  return (data ?? []).map(r => {
    const [y, m, d] = (r.ends_on as string).split('-').map(Number)
    const daysUntil = Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000)
    return {
      ...r,
      amount_usd: r.amount_usd === null ? null : Number(r.amount_usd),
      daysUntil,
      urgency: daysUntil < 0 ? 'overdue' as const : daysUntil <= RENEWAL_URGENT_DAYS ? 'urgent' as const : 'soon' as const,
    }
  })
}

// What the active subscriptions commit us to over the next `days`. Answers
// "what is about to hit us" rather than only "what renews".
export async function getUpcomingCommitment(days: number) {
  const renewals = await getRenewalsDue(days)
  return {
    renewals,
    total: renewals.reduce((a, r) => a + (r.amount_usd ?? 0), 0),
    urgent: renewals.filter(r => r.urgency !== 'soon'),
  }
}
