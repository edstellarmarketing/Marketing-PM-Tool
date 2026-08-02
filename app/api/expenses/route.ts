import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isModuleGrantor, requireModuleAccess, requireModuleManager } from '@/lib/api'
import {
  applyExpenseFilters, EXPENSE_SORTABLE, expenseCreateSchema, friendlyDbError, validationResponse,
} from '@/lib/expenses'

// Ledger listing. Filtering and pagination happen in the database rather than in
// the browser — the pattern the older tables in this app use (fetch everything,
// filter client-side) is fine for a few hundred tasks but this ledger starts at
// ~1,000 rows the day the backfill lands and only grows.
export const dynamic = 'force-dynamic'

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

interface LookupRow { id: string; name: string }

type AdminClient = ReturnType<typeof createAdminClient>

export async function GET(req: NextRequest) {
  const { profile, error } = await requireModuleAccess('expenses')
  if (error || !profile) return error!

  const sp = new URL(req.url).searchParams
  const db = createAdminClient()

  // `deleted=1` lists the recycle bin instead of the live ledger. Owner-only:
  // a soft-deleted row should look gone to every other grant holder, so a
  // non-owner asking for it gets a 404 rather than an empty list, which would
  // confirm the view exists.
  const wantDeleted = sp.get('deleted') === '1'
  if (wantDeleted && !(await isModuleGrantor(profile.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(sp.get('pageSize') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE))

  const sortRaw = sp.get('sort') ?? 'expense_date'
  const sort = EXPENSE_SORTABLE.has(sortRaw) ? sortRaw : 'expense_date'
  const ascending = sp.get('dir') === 'asc'

  // Shared with the XLSX export so the two can never disagree about which rows
  // a given set of filters means.
  const applyFilters = <T,>(q: T): T => applyExpenseFilters(q, sp, { deleted: wantDeleted })

  // ── Totals + count for the whole filtered set, not just this page ───────────
  // Runs FIRST so the page can be clamped below.
  //
  // Fetched in explicit chunks because PostgREST caps an unbounded select at
  // 1,000 rows. Without this the footer total silently under-reports as soon as
  // a filter matches more than that — with 1,295 rows imported it read
  // $79,984.49 against a true $97,085.92, and nothing in the response hinted
  // that rows had been dropped.
  const CHUNK = 1000
  const amounts: { amount_usd: string | number; tax_usd: string | number | null; total_usd: string | number }[] = []
  let total = 0
  for (let offset = 0; ; offset += CHUNK) {
    const { data, count, error: e } = await applyFilters(
      db.from('expenses').select('amount_usd, tax_usd, total_usd', { count: 'exact' }),
    ).range(offset, offset + CHUNK - 1)
    if (e) return NextResponse.json({ error: e.message }, { status: 500 })
    if (offset === 0) total = count ?? 0
    amounts.push(...(data ?? []))
    if (amounts.length >= total || (data ?? []).length === 0) break
  }

  // PostgREST answers a range past the end of the result set with
  // "Requested range not satisfiable" rather than an empty page. That is
  // reachable in normal use — sitting on page 40 and applying a filter that
  // leaves three pages, or deleting the last row of the last page — so the page
  // is clamped here instead of letting the list break.
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, lastPage)

  // ── Page of rows ────────────────────────────────────────────────────────────
  const { data: rows, error: rowsError } = total === 0
    ? { data: [], error: null }
    : await applyFilters(
        db.from('expenses').select(
          `id, expense_date, amount_usd, tax_usd, total_usd, initial_price_usd,
           category_id, backlink_type_id, vendor_id, subscription_id, team_id, vertical_id,
           link_url, link_site, link_rel, link_domain, payee, acquired_by, country,
           payment_status, payment_method, invoice_url, description, notes, meta,
           created_by, created_at, updated_at, deleted_at, deleted_by`,
        ),
      )
        .order(sort, { ascending, nullsFirst: false })
        // Tie-break so paging is stable when many rows share a date.
        .order('created_at', { ascending: false })
        .range((safePage - 1) * pageSize, safePage * pageSize - 1)

  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 })

  const totals = amounts.reduce(
    (acc: { net_usd: number; tax_usd: number; total_usd: number }, r) => ({
      net_usd: acc.net_usd + Number(r.amount_usd ?? 0),
      tax_usd: acc.tax_usd + Number(r.tax_usd ?? 0),
      total_usd: acc.total_usd + Number(r.total_usd ?? 0),
    }),
    { net_usd: 0, tax_usd: 0, total_usd: 0 },
  )

  // ── Resolve display names ───────────────────────────────────────────────────
  // Deliberately not PostgREST embeds: `expenses` has two FKs to `profiles`
  // (created_by, deleted_by), which makes an embed ambiguous. Separate lookups
  // are unambiguous and cost one round-trip each.
  const list = rows ?? []
  const ids = (key: string) => [...new Set(list.map((r: Record<string, unknown>) => r[key]).filter(Boolean))] as string[]

  const [cats, teams, verticals, vendors, blTypes, people] = await Promise.all([
    fetchNames(db, 'expense_categories', ids('category_id')),
    fetchNames(db, 'expense_teams', ids('team_id')),
    fetchNames(db, 'expense_verticals', ids('vertical_id')),
    fetchNames(db, 'expense_vendors', ids('vendor_id')),
    fetchNames(db, 'expense_backlink_types', ids('backlink_type_id')),
    fetchProfiles(db, [...ids('created_by'), ...ids('deleted_by')]),
  ])

  return NextResponse.json({
    rows: list.map((r: Record<string, unknown>) => ({
      ...r,
      amount_usd: Number(r.amount_usd ?? 0),
      tax_usd: r.tax_usd === null ? null : Number(r.tax_usd),
      total_usd: Number(r.total_usd ?? 0),
      initial_price_usd: r.initial_price_usd === null ? null : Number(r.initial_price_usd),
      category_name: cats.get(r.category_id as string) ?? null,
      team_name: teams.get(r.team_id as string) ?? null,
      vertical_name: verticals.get(r.vertical_id as string) ?? null,
      vendor_name: vendors.get(r.vendor_id as string) ?? null,
      backlink_type_name: blTypes.get(r.backlink_type_id as string) ?? null,
      created_by_name: people.get(r.created_by as string) ?? null,
      deleted_by_name: people.get(r.deleted_by as string) ?? null,
    })),
    total,
    totals,
    // The clamped page, so a client that asked for page 999 can correct itself.
    page: safePage,
    pageSize,
    sort,
    dir: ascending ? 'asc' : 'desc',
  })
}

// Create one expense. Anyone with an `expenses` grant may create; only the
// module owner may delete (Phase 4). `created_by` is taken from the session, not
// the body, so a caller cannot attribute an entry to someone else.
export async function POST(req: NextRequest) {
  // Creating a ledger row is a manager action; viewers are read-only.
  const { profile, error } = await requireModuleManager('expenses')
  if (error || !profile) return error!

  const body = await req.json().catch(() => null)
  const parsed = expenseCreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationResponse(parsed.error), { status: 400 })

  const db = createAdminClient()
  const { data, error: dbError } = await db
    .from('expenses')
    .insert({ ...parsed.data, created_by: profile.id })
    .select('id, expense_date, amount_usd, total_usd, link_domain')
    .single()

  if (dbError) return NextResponse.json({ error: friendlyDbError(dbError) }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}

async function fetchNames(db: AdminClient, table: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await db.from(table).select('id, name').in('id', ids)
  return new Map(((data ?? []) as LookupRow[]).map(r => [r.id, r.name]))
}

async function fetchProfiles(db: AdminClient, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await db.from('profiles').select('id, full_name').in('id', ids)
  return new Map(((data ?? []) as { id: string; full_name: string }[]).map(r => [r.id, r.full_name]))
}
