import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createAdminClient } from '@/lib/supabase/admin'
import { isModuleGrantor, requireModuleAccess } from '@/lib/api'
import { applyExpenseFilters, EXPENSE_SORTABLE } from '@/lib/expenses'

// XLSX export of the ledger, honouring exactly the filters on screen — it shares
// applyExpenseFilters with the listing route, so "export what I am looking at"
// stays true.
export const dynamic = 'force-dynamic'

const CHUNK = 1000
// A hard ceiling so a mis-filtered request cannot try to build a workbook from
// an unbounded result set. Four years is ~1,300 rows, so this is far above real
// use; if it ever trips, the response says so rather than silently truncating.
const MAX_ROWS = 50_000

interface Row {
  id: string
  ref: string | null
  expense_date: string
  amount_usd: string | number
  tax_usd: string | number | null
  total_usd: string | number
  initial_price_usd: string | number | null
  category_id: string | null
  backlink_type_id: string | null
  vendor_id: string | null
  team_id: string | null
  vertical_id: string | null
  subscription_id: string | null
  link_url: string | null
  link_site: string | null
  link_domain: string | null
  link_rel: string | null
  payee: string | null
  acquired_by: string | null
  country: string | null
  payment_status: string
  payment_method: string | null
  invoice_url: string | null
  description: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export async function GET(req: NextRequest) {
  const { profile, error } = await requireModuleAccess('expenses')
  if (error || !profile) return error!

  const sp = new URL(req.url).searchParams
  const wantDeleted = sp.get('deleted') === '1'
  if (wantDeleted && !(await isModuleGrantor(profile.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const sortRaw = sp.get('sort') ?? 'expense_date'
  const sort = EXPENSE_SORTABLE.has(sortRaw) ? sortRaw : 'expense_date'
  const ascending = sp.get('dir') === 'asc'

  const db = createAdminClient()

  // Paged explicitly: PostgREST caps an unbounded select at 1,000 rows and says
  // nothing about it. An export that silently stopped at 1,000 would be worse
  // than no export at all.
  const rows: Row[] = []
  for (let offset = 0; ; offset += CHUNK) {
    const { data, error: e } = await applyExpenseFilters(
      db.from('expenses').select(
        `id, ref, expense_date, amount_usd, tax_usd, total_usd, initial_price_usd,
         category_id, backlink_type_id, vendor_id, team_id, vertical_id, subscription_id,
         link_url, link_site, link_domain, link_rel, payee, acquired_by, country,
         payment_status, payment_method, invoice_url, description, notes, created_by, created_at`,
      ),
      sp,
      { deleted: wantDeleted },
    )
      .order(sort, { ascending, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + CHUNK - 1)

    if (e) return NextResponse.json({ error: e.message }, { status: 500 })
    const batch = (data ?? []) as unknown as Row[]
    rows.push(...batch)
    if (batch.length < CHUNK) break
    if (rows.length >= MAX_ROWS) {
      return NextResponse.json(
        { error: `Too many rows to export (${MAX_ROWS}+). Narrow the filters and try again.` },
        { status: 413 },
      )
    }
  }

  const [cats, teams, verticals, vendors, blTypes, subs, people] = await Promise.all([
    names(db, 'expense_categories'),
    names(db, 'expense_teams'),
    names(db, 'expense_verticals'),
    names(db, 'expense_vendors'),
    names(db, 'expense_backlink_types'),
    names(db, 'expense_subscriptions'),
    profileNames(db, [...new Set(rows.map(r => r.created_by).filter(Boolean))] as string[]),
  ])

  const num = (v: string | number | null) => (v === null ? null : Number(v))

  // Names, not UUIDs — a spreadsheet full of ids is unusable outside the app.
  // Column order mirrors the ledger table so the export reads the same way.
  const sheetRows = rows.map(r => ({
    // First column, and the key a future bulk import matches on: leave it
    // untouched when editing, and never invent one for a new row.
    Ref: r.ref ?? '',
    Date: r.expense_date,
    Category: cats.get(r.category_id ?? '') ?? '',
    Description: r.description ?? '',
    Vendor: vendors.get(r.vendor_id ?? '') ?? '',
    Team: teams.get(r.team_id ?? '') ?? '',
    Vertical: verticals.get(r.vertical_id ?? '') ?? '',
    'Amount (USD)': num(r.amount_usd),
    'Tax (USD)': num(r.tax_usd),
    'Total (USD)': num(r.total_usd),
    'Asking price (USD)': num(r.initial_price_usd),
    Status: r.payment_status,
    'Payment method': r.payment_method ?? '',
    'Paid to': r.payee ?? '',
    'Acquired by': r.acquired_by ?? '',
    Country: r.country ?? '',
    'Link type': blTypes.get(r.backlink_type_id ?? '') ?? '',
    'Link result': r.link_rel ?? '',
    'Publisher site': r.link_site ?? '',
    'Live link': r.link_url ?? '',
    Domain: r.link_domain ?? '',
    Subscription: subs.get(r.subscription_id ?? '') ?? '',
    'Invoice URL': r.invoice_url ?? '',
    Notes: r.notes ?? '',
    'Entered by': people.get(r.created_by ?? '') ?? '',
  }))

  const ws = XLSX.utils.json_to_sheet(sheetRows)
  ws['!autofilter'] = { ref: ws['!ref'] ?? 'A1' }
  // One width per column, in order. Ref is first, so this list starts with it —
  // a short list silently shifts every later column's width onto its neighbour.
  ws['!cols'] = [
    { wch: 12 }, // Ref
    { wch: 11 }, { wch: 20 }, { wch: 40 }, { wch: 22 }, { wch: 14 }, { wch: 12 },
    { wch: 13 }, { wch: 11 }, { wch: 13 }, { wch: 17 }, { wch: 10 }, { wch: 15 },
    { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 13 }, { wch: 30 },
    { wch: 34 }, { wch: 24 }, { wch: 22 }, { wch: 30 }, { wch: 34 }, { wch: 16 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, wantDeleted ? 'Deleted expenses' : 'Expenses')

  // 'array' yields an ArrayBuffer, which is a valid BodyInit. Writing to a Node
  // Buffer instead is what makes the two older xlsx routes in this app fail
  // typecheck.
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

  const stamp = new Date().toISOString().slice(0, 10)
  const scope = sp.get('year') ?? sp.get('month') ?? 'all'
  const filename = `expenses-${scope}-${stamp}.xlsx`

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

type Db = ReturnType<typeof createAdminClient>

async function names(db: Db, table: string): Promise<Map<string, string>> {
  const { data } = await db.from(table).select('id, name')
  return new Map(((data ?? []) as { id: string; name: string }[]).map(r => [r.id, r.name]))
}

async function profileNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await db.from('profiles').select('id, full_name').in('id', ids)
  return new Map(((data ?? []) as { id: string; full_name: string }[]).map(r => [r.id, r.full_name]))
}
