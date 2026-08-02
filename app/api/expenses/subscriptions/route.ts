import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModuleAccess, requireModuleManager } from '@/lib/api'
import { friendlyDbError, subscriptionCreateSchema, validationResponse } from '@/lib/expenses'

// The commitments registry. A subscription is what we are committed to; the
// charges against it live in `expenses`, linked by subscription_id
// (expenses.md §2.1). Nothing here is auto-generated into the ledger — every
// charge is a deliberate entry via "log a charge" (decision 4).
export const dynamic = 'force-dynamic'

const SELECT = `id, name, vendor_id, billing_cycle, amount_usd, started_on, ends_on,
                payment_method, status, owner_profile_id, owner_name, team_id, seats,
                invoice_url, notes, created_at, updated_at`

const STATUSES = new Set(['active', 'cancelled', 'expired'])

export async function GET(req: NextRequest) {
  const { error } = await requireModuleAccess('expenses')
  if (error) return error

  const sp = new URL(req.url).searchParams
  const db = createAdminClient()

  let q = db.from('expense_subscriptions').select(SELECT).is('deleted_at', null)

  const status = sp.get('status')
  if (status && STATUSES.has(status)) q = q.eq('status', status)

  const team = sp.get('team')
  if (team) q = q.eq('team_id', team)

  const cycle = sp.get('cycle')
  if (cycle) q = q.eq('billing_cycle', cycle)

  // Renewal window. `dueWithin=60` returns anything renewing in the next 60 days
  // AND anything already past its date — an overdue renewal is the case most
  // worth surfacing, so it must not fall outside the window.
  const dueWithin = Number(sp.get('dueWithin'))
  if (Number.isFinite(dueWithin) && dueWithin > 0) {
    const until = new Date()
    until.setDate(until.getDate() + dueWithin)
    q = q.not('ends_on', 'is', null).lte('ends_on', until.toISOString().slice(0, 10))
  }

  const search = sp.get('q')?.trim()
  if (search) {
    const safe = search.replace(/[(),*%_]/g, ' ').trim()
    if (safe) q = q.or(`name.ilike.*${safe}*,owner_name.ilike.*${safe}*,notes.ilike.*${safe}*`)
  }

  const { data, error: dbError } = await q.order('ends_on', { ascending: true, nullsFirst: false }).order('name')
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  const rows = data ?? []

  // Charge history per subscription. This is what makes "renewed but never
  // charged" visible — a renewal date alone cannot tell you whether the money
  // actually went out.
  const ids = rows.map(r => r.id)
  const charges = new Map<string, { last: string | null; count: number; total: number }>()
  if (ids.length) {
    const { data: linked } = await db
      .from('expenses')
      .select('subscription_id, expense_date, total_usd')
      .in('subscription_id', ids)
      .is('deleted_at', null)
    for (const c of (linked ?? []) as { subscription_id: string; expense_date: string; total_usd: string | number }[]) {
      const cur = charges.get(c.subscription_id) ?? { last: null, count: 0, total: 0 }
      cur.count += 1
      cur.total += Number(c.total_usd ?? 0)
      if (!cur.last || c.expense_date > cur.last) cur.last = c.expense_date
      charges.set(c.subscription_id, cur)
    }
  }

  const [vendors, teams, owners] = await Promise.all([
    names(db, 'expense_vendors'),
    names(db, 'expense_teams'),
    profileNames(db, rows.map(r => r.owner_profile_id).filter(Boolean) as string[]),
  ])

  const today = new Date().toISOString().slice(0, 10)

  return NextResponse.json(
    rows.map(r => {
      const c = charges.get(r.id)
      return {
        ...r,
        amount_usd: r.amount_usd === null ? null : Number(r.amount_usd),
        vendor_name: r.vendor_id ? vendors.get(r.vendor_id) ?? null : null,
        team_name: r.team_id ? teams.get(r.team_id) ?? null : null,
        owner_display: (r.owner_profile_id ? owners.get(r.owner_profile_id) : null) ?? r.owner_name ?? null,
        last_charge_date: c?.last ?? null,
        charge_count: c?.count ?? 0,
        charged_total: c?.total ?? 0,
        // Only meaningful for an active subscription — a cancelled one passing
        // its date is expected, not a problem to flag.
        is_overdue: r.status === 'active' && !!r.ends_on && r.ends_on < today,
      }
    }),
  )
}

export async function POST(req: NextRequest) {
  const { profile, error } = await requireModuleManager('expenses')
  if (error || !profile) return error!

  const body = await req.json().catch(() => null)
  const parsed = subscriptionCreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationResponse(parsed.error), { status: 400 })

  const db = createAdminClient()
  const { data, error: dbError } = await db
    .from('expense_subscriptions')
    .insert({ ...parsed.data, created_by: profile.id })
    .select('id, name')
    .single()

  if (dbError) return NextResponse.json({ error: friendlyDbError(dbError) }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
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
