import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModuleGrantor } from '@/lib/api'

// Who receives the weekly spend digest. Owner-only in every direction.
//
// A recipient MUST already hold an `expenses` grant. The digest carries real
// figures — weekly totals, vendor names, pending payments, year-to-date — so
// emailing it to someone without access would route around the module's own
// permissions. Grant access first, then add them here.
export const dynamic = 'force-dynamic'

export async function GET() {
  const { error } = await requireModuleGrantor('expenses')
  if (error) return error

  const db = createAdminClient()
  const { data: rows, error: dbError } = await db
    .from('expense_report_recipients')
    .select('user_id, created_at')
    .order('created_at')
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  const ids = (rows ?? []).map(r => r.user_id)
  const profiles = ids.length
    ? (await db.from('profiles').select('id, full_name, avatar_url, designation').in('id', ids)).data ?? []
    : []
  const byId = new Map(profiles.map((p: { id: string }) => [p.id, p]))

  // Everyone holding a grant — the only people who may be added.
  const { data: grants } = await db
    .from('module_access')
    .select('user_id, role')
    .eq('module_key', 'expenses')
  const grantIds = (grants ?? []).map(g => g.user_id)
  const eligibleProfiles = grantIds.length
    ? (await db.from('profiles').select('id, full_name, designation').in('id', grantIds)).data ?? []
    : []
  const roleById = new Map((grants ?? []).map(g => [g.user_id, g.role]))

  return NextResponse.json({
    recipients: (rows ?? []).map(r => ({
      user_id: r.user_id,
      created_at: r.created_at,
      ...(byId.get(r.user_id) ?? { full_name: 'Unknown user', avatar_url: null, designation: null }),
    })),
    eligible: eligibleProfiles
      .map((p: { id: string; full_name: string; designation: string | null }) => ({
        ...p, role: roleById.get(p.id) ?? 'viewer',
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name)),
  })
}

export async function POST(req: NextRequest) {
  const { profile, error } = await requireModuleGrantor('expenses')
  if (error || !profile) return error!

  const body = await req.json().catch(() => null)
  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : ''
  if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

  const db = createAdminClient()

  // The rule that matters: no grant, no digest. Checked here rather than trusted
  // from the client, because the client only ever offers eligible people and an
  // attacker would not use the client.
  const { data: grant } = await db
    .from('module_access')
    .select('user_id')
    .eq('module_key', 'expenses')
    .eq('user_id', userId)
    .maybeSingle()
  if (!grant) {
    return NextResponse.json(
      { error: 'That person does not have access to Expenses. Grant them access first, then add them here.' },
      { status: 400 },
    )
  }

  const { error: dbError } = await db
    .from('expense_report_recipients')
    .insert({ user_id: userId, added_by: profile.id })

  if (dbError) {
    if (dbError.code === '23505') return NextResponse.json({ error: 'They already receive it.' }, { status: 409 })
    return NextResponse.json({ error: dbError.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireModuleGrantor('expenses')
  if (error) return error

  const userId = new URL(req.url).searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

  const db = createAdminClient()
  const { error: dbError } = await db.from('expense_report_recipients').delete().eq('user_id', userId)
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
