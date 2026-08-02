import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModuleAccess } from '@/lib/api'

// Dimension breakdowns for the dashboard: team, vertical, vendor, backlink type,
// plus negotiated savings.
//
// `expense_monthly_totals` only groups by category, and this instance has
// PostgREST aggregates disabled, so the rows are fetched and grouped here.
// At ~1,300 rows for four years that is cheap; if the ledger reaches six figures,
// replace this with a SQL view or an RPC per dimension.
export const dynamic = 'force-dynamic'

const CHUNK = 1000
const TOP_N = 10

interface Row {
  expense_date: string
  category_id: string | null
  team_id: string | null
  vertical_id: string | null
  vendor_id: string | null
  backlink_type_id: string | null
  link_domain: string | null
  amount_usd: string | number
  tax_usd: string | number | null
  total_usd: string | number
  initial_price_usd: string | number | null
}

export async function GET(req: NextRequest) {
  const { error } = await requireModuleAccess('expenses')
  if (error) return error

  const sp = new URL(req.url).searchParams
  const yearRaw = sp.get('year')
  const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null

  const db = createAdminClient()

  // PostgREST caps an unbounded select at 1,000 rows and says nothing about it,
  // so page explicitly — this silently under-reported the ledger footer in
  // Phase 2 before it was caught.
  const rows: Row[] = []
  for (let offset = 0; ; offset += CHUNK) {
    let q = db
      .from('expenses')
      .select('expense_date, category_id, team_id, vertical_id, vendor_id, backlink_type_id, link_domain, amount_usd, tax_usd, total_usd, initial_price_usd')
      .is('deleted_at', null)
    if (year) q = q.gte('expense_date', `${year}-01-01`).lt('expense_date', `${year + 1}-01-01`)

    const { data, error: e } = await q.range(offset, offset + CHUNK - 1)
    if (e) return NextResponse.json({ error: e.message }, { status: 500 })
    const batch = (data ?? []) as unknown as Row[]
    rows.push(...batch)
    if (batch.length < CHUNK) break
  }

  const [teams, verticals, vendors, backlinkTypes, categories] = await Promise.all([
    names(db, 'expense_teams'),
    names(db, 'expense_verticals'),
    names(db, 'expense_vendors'),
    names(db, 'expense_backlink_types'),
    names(db, 'expense_categories'),
  ])

  const n = (v: string | number | null | undefined) => Number(v ?? 0)

  // Group into { name, total, net, count }, largest first. `null` becomes an
  // explicit "Unassigned" bucket rather than being dropped — for imported
  // history most rows have no team, and hiding that would overstate how
  // complete the dimension is.
  function group(key: keyof Row, lookup: Map<string, string>) {
    const acc = new Map<string, { name: string; total: number; net: number; count: number }>()
    for (const r of rows) {
      const id = (r[key] as string | null) ?? '__none__'
      const name = id === '__none__' ? 'Unassigned' : lookup.get(id) ?? 'Unknown'
      const cur = acc.get(id) ?? { name, total: 0, net: 0, count: 0 }
      cur.total += n(r.total_usd)
      cur.net += n(r.amount_usd)
      cur.count += 1
      acc.set(id, cur)
    }
    return [...acc.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total)
  }

  const byTeam = group('team_id', teams)
  const byVertical = group('vertical_id', verticals)

  // Counterparty, not vendor_id. Backlink rows deliberately carry no vendor —
  // the publisher is the counterparty and lives in link_domain — so keying on
  // vendor alone collapsed 91% of 2024 into one opaque "Unassigned" bar.
  const byVendorAll = (() => {
    const acc = new Map<string, { name: string; total: number; net: number; count: number }>()
    for (const r of rows) {
      const vendorName = r.vendor_id ? vendors.get(r.vendor_id) : null
      const name = vendorName ?? (r.link_domain || null) ?? 'Unattributed'
      const cur = acc.get(name) ?? { name, total: 0, net: 0, count: 0 }
      cur.total += n(r.total_usd)
      cur.net += n(r.amount_usd)
      cur.count += 1
      acc.set(name, cur)
    }
    return [...acc.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total)
  })()
  const byBacklinkType = group('backlink_type_id', backlinkTypes)
    // This dimension only applies to link spend, so an Unassigned bar would be
    // every non-link row and would dwarf the real ones.
    .filter(b => b.id !== '__none__')

  // Top N vendors, with the tail folded into one "Other" bar rather than
  // truncated — dropping it would make the bars look like the whole picture.
  const byVendor = (() => {
    const named = byVendorAll.filter(v => v.id !== 'Unattributed')
    const head = named.slice(0, TOP_N)
    const tail = named.slice(TOP_N)
    const unattributed = byVendorAll.find(v => v.id === 'Unattributed')
    const out = [...head]
    if (tail.length) {
      out.push({
        id: '__other__',
        name: `Other (${tail.length} counterparties)`,
        total: tail.reduce((a, v) => a + v.total, 0),
        net: tail.reduce((a, v) => a + v.net, 0),
        count: tail.reduce((a, v) => a + v.count, 0),
      })
    }
    if (unattributed) out.push(unattributed)
    return out
  })()

  // ── Savings ────────────────────────────────────────────────────────────────
  // Only rows carrying both prices can contribute; anything else has no ask to
  // compare against and would understate the rate if counted as zero saving.
  //
  // Split into two genuinely different things. Talking someone down from $200 to
  // $150 is negotiation; trading a backlink instead of paying a $1,499 ask is
  // barter — the source marks those "Free" with Payment Type "Link Exchange".
  // Reporting them as one number inflates the discount rate and flatters the
  // negotiating, so they are counted separately.
  const withAsk = rows.filter(r => r.initial_price_usd !== null && n(r.initial_price_usd) > 0)
  const negotiated = withAsk.filter(r => n(r.amount_usd) > 0)
  const avoided = withAsk.filter(r => n(r.amount_usd) <= 0)

  const askedTotal = negotiated.reduce((a, r) => a + n(r.initial_price_usd), 0)
  const paidTotal = negotiated.reduce((a, r) => a + n(r.amount_usd), 0)
  const avoidedTotal = avoided.reduce((a, r) => a + n(r.initial_price_usd), 0)

  // Grouped by counterparty, not by vendor_id. Almost all negotiation happens on
  // backlinks, and those rows carry no vendor — the publisher is the counterparty
  // and lives in link_domain. Keying on vendor alone collapsed the whole panel
  // into a single "Unassigned" row.
  const savingsByVendor = (() => {
    const acc = new Map<string, { name: string; asked: number; paid: number; count: number }>()
    for (const r of negotiated) {
      const vendorName = r.vendor_id ? vendors.get(r.vendor_id) : null
      const name = vendorName ?? (r.link_domain || null) ?? 'Unattributed'
      const id = name
      const cur = acc.get(id) ?? { name, asked: 0, paid: 0, count: 0 }
      cur.asked += n(r.initial_price_usd)
      cur.paid += n(r.amount_usd)
      cur.count += 1
      acc.set(id, cur)
    }
    return [...acc.values()]
      .map(v => ({ ...v, saved: v.asked - v.paid, rate: v.asked > 0 ? (v.asked - v.paid) / v.asked : 0 }))
      .filter(v => v.saved > 0.005)
      .sort((a, b) => b.saved - a.saved)
      .slice(0, 6)
  })()

  return NextResponse.json({
    year,
    rowCount: rows.length,
    byTeam,
    byVertical,
    byVendor,
    byBacklinkType,
    byCategory: group('category_id', categories),
    savings: {
      asked: askedTotal,
      paid: paidTotal,
      saved: askedTotal - paidTotal,
      rate: askedTotal > 0 ? (askedTotal - paidTotal) / askedTotal : 0,
      rowsWithBothPrices: negotiated.length,
      byVendor: savingsByVendor,
      avoided: {
        total: avoidedTotal,
        count: avoided.length,
      },
    },
  })
}

type Db = ReturnType<typeof createAdminClient>

async function names(db: Db, table: string): Promise<Map<string, string>> {
  const { data } = await db.from(table).select('id, name')
  return new Map(((data ?? []) as { id: string; name: string }[]).map(r => [r.id, r.name]))
}
