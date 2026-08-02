import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModuleAccess } from '@/lib/api'

// Advisory duplicate lookup for the entry form. Two tiers:
//   exact  — the same live link is already recorded
//   domain — we have bought from this site before
//
// This never blocks a save (decision 8 in expenses.md): a second placement on
// the same site, a renewal, or a genuine re-buy are all legitimate. The job is
// to show what already exists so the choice is informed.
export const dynamic = 'force-dynamic'

const SHOW = 6

const SELECT = `id, expense_date, amount_usd, total_usd, link_url, link_domain,
                payment_status, vertical_id, backlink_type_id, created_by, description`

interface Row {
  id: string
  vertical_id: string | null
  backlink_type_id: string | null
  created_by: string | null
  [key: string]: unknown
}

export async function GET(req: NextRequest) {
  const { error } = await requireModuleAccess('expenses')
  if (error) return error

  const sp = new URL(req.url).searchParams
  const linkUrl = sp.get('link_url')?.trim() || ''
  const linkSite = sp.get('link_site')?.trim() || ''
  // When editing, the row itself is not a duplicate of itself.
  const excludeId = sp.get('excludeId') || ''

  if (!linkUrl && !linkSite) {
    return NextResponse.json({ domain: null, exact: [], domainMatches: [], exactTotal: 0, domainTotal: 0 })
  }

  const db = createAdminClient()

  // Normalise via the same SQL function the generated column uses (migration
  // 073) rather than reimplementing it here — the two must never disagree.
  const { data: domain, error: rpcError } = await db.rpc('expense_link_domain', {
    url: linkSite || linkUrl,
  })
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 })

  const normalisedDomain = typeof domain === 'string' ? domain : ''

  // ── Tier 1: the exact same live link ────────────────────────────────────────
  let exact: Row[] = []
  let exactTotal = 0
  if (linkUrl) {
    let q = db.from('expenses').select(SELECT, { count: 'exact' })
      .is('deleted_at', null)
      // Exact equality, deliberately not ilike: `%` and `_` are LIKE wildcards
      // and URLs are full of percent-encoding, so `/a%20b` would match far more
      // than it should. A case-variant of the same URL still gets caught by the
      // domain tier below, so nothing is lost.
      .eq('link_url', linkUrl)
      .order('expense_date', { ascending: false })
      .limit(SHOW)
    if (excludeId) q = q.neq('id', excludeId)
    const { data, count, error: e } = await q
    if (e) return NextResponse.json({ error: e.message }, { status: 500 })
    exact = (data ?? []) as unknown as Row[]
    exactTotal = count ?? 0
  }

  // ── Tier 2: same domain, excluding anything already reported as exact ───────
  let domainMatches: Row[] = []
  let domainTotal = 0
  if (normalisedDomain) {
    const exactIds = new Set(exact.map(r => r.id))
    let q = db.from('expenses').select(SELECT, { count: 'exact' })
      .is('deleted_at', null)
      .eq('link_domain', normalisedDomain)
      .order('expense_date', { ascending: false })
      .limit(SHOW + exactIds.size)
    if (excludeId) q = q.neq('id', excludeId)
    const { data, count, error: e } = await q
    if (e) return NextResponse.json({ error: e.message }, { status: 500 })
    const rows = ((data ?? []) as unknown as Row[]).filter(r => !exactIds.has(r.id))
    domainMatches = rows.slice(0, SHOW)
    // The count came back including the exact rows, so discount them.
    domainTotal = Math.max(0, (count ?? 0) - exactIds.size)
  }

  // Resolve display names for the handful of rows being shown.
  const all = [...exact, ...domainMatches]
  const ids = (key: keyof Row) => [...new Set(all.map(r => r[key]).filter(Boolean))] as string[]

  const [verticals, blTypes, creators] = await Promise.all([
    names(db, 'expense_verticals', ids('vertical_id')),
    names(db, 'expense_backlink_types', ids('backlink_type_id')),
    profileNames(db, ids('created_by')),
  ])

  const shape = (r: Row) => ({
    id: r.id,
    expense_date: r.expense_date,
    amount_usd: Number(r.amount_usd ?? 0),
    total_usd: Number(r.total_usd ?? 0),
    link_url: r.link_url ?? null,
    link_domain: r.link_domain ?? null,
    payment_status: r.payment_status,
    description: r.description ?? null,
    vertical_name: verticals.get(r.vertical_id ?? '') ?? null,
    backlink_type_name: blTypes.get(r.backlink_type_id ?? '') ?? null,
    created_by_name: creators.get(r.created_by ?? '') ?? null,
  })

  return NextResponse.json({
    domain: normalisedDomain || null,
    exact: exact.map(shape),
    domainMatches: domainMatches.map(shape),
    exactTotal,
    domainTotal,
  })
}

type Db = ReturnType<typeof createAdminClient>

async function names(db: Db, table: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await db.from(table).select('id, name').in('id', ids)
  return new Map(((data ?? []) as { id: string; name: string }[]).map(r => [r.id, r.name]))
}

async function profileNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await db.from('profiles').select('id, full_name').in('id', ids)
  return new Map(((data ?? []) as { id: string; full_name: string }[]).map(r => [r.id, r.full_name]))
}
