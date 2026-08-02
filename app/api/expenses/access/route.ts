import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModuleGrantor } from '@/lib/api'

// Access management for the hidden `expenses` module. Every handler is gated on
// requireModuleGrantor — holding the module is not enough to widen the circle,
// and being an admin grants nothing here. Denials are 404s, matching the rest
// of the module: an unauthorized caller cannot confirm these endpoints exist.

const MODULE = 'expenses' as const

interface ProfileLite {
  id: string
  full_name: string
  avatar_url: string | null
  designation: string | null
  department: string | null
}

// GET — who currently has the module.
export async function GET() {
  const { error } = await requireModuleGrantor(MODULE)
  if (error) return error

  const admin = createAdminClient()
  const { data: grants, error: dbError } = await admin
    .from('module_access')
    .select('id, user_id, granted_by, granted_at, note, role')
    .eq('module_key', MODULE)
    .order('granted_at', { ascending: true })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  const rows = grants ?? []
  // Resolve names in one round-trip. Deliberately not a PostgREST embed:
  // module_access has two FKs to profiles (user_id, granted_by), which makes
  // the relationship ambiguous.
  const ids = [...new Set(rows.flatMap(r => [r.user_id, r.granted_by].filter(Boolean) as string[]))]
  const { data: profiles } = ids.length
    ? await admin.from('profiles').select('id, full_name, avatar_url, designation, department').in('id', ids)
    : { data: [] as ProfileLite[] }

  const byId = new Map((profiles ?? []).map((p: ProfileLite) => [p.id, p]))

  return NextResponse.json(
    rows.map(r => ({
      ...r,
      user: byId.get(r.user_id) ?? null,
      granter_name: r.granted_by ? byId.get(r.granted_by)?.full_name ?? null : null,
    })),
  )
}

// POST — grant the module to a user.
export async function POST(req: NextRequest) {
  const { profile, error } = await requireModuleGrantor(MODULE)
  if (error || !profile) return error!

  const body = await req.json().catch(() => null)
  const userId = typeof body?.user_id === 'string' ? body.user_id.trim() : ''
  const note = typeof body?.note === 'string' ? body.note.trim() || null : null
  // Defaults to the lesser privilege if the caller omits it, matching the column
  // default — a grant made carelessly must not be able to delete.
  const role = body?.role === 'manager' ? 'manager' : 'viewer'
  if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

  const admin = createAdminClient()

  // Reject unknown / deactivated accounts up front, so a typo'd id can't create
  // a dangling grant that silently activates if that id is ever reused.
  const { data: target } = await admin
    .from('profiles')
    .select('id, is_active')
    .eq('id', userId)
    .maybeSingle()
  if (!target) return NextResponse.json({ error: 'No such user' }, { status: 400 })
  if (!target.is_active) return NextResponse.json({ error: 'That account is deactivated' }, { status: 400 })

  const { data, error: dbError } = await admin
    .from('module_access')
    .insert({ user_id: userId, module_key: MODULE, granted_by: profile.id, note, role })
    .select('id, user_id, granted_by, granted_at, note, role')
    .single()

  if (dbError) {
    // 23505 = unique_violation on (user_id, module_key)
    if (dbError.code === '23505') {
      return NextResponse.json({ error: 'That user already has access' }, { status: 409 })
    }
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

// PATCH — change someone's role without revoking and re-granting.
export async function PATCH(req: NextRequest) {
  const { profile, error } = await requireModuleGrantor(MODULE)
  if (error || !profile) return error!

  const body = await req.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  const role = body?.role === 'manager' ? 'manager' : body?.role === 'viewer' ? 'viewer' : null
  if (!id || !role) return NextResponse.json({ error: 'id and role are required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: grant } = await admin
    .from('module_access').select('user_id').eq('id', id).eq('module_key', MODULE).maybeSingle()
  if (!grant) return NextResponse.json({ error: 'No such grant' }, { status: 404 })

  // Demoting yourself would be undone anyway — moduleRole() force-promotes the
  // owner — so refuse it rather than leave a row that lies about your access.
  if (grant.user_id === profile.id && role === 'viewer') {
    return NextResponse.json(
      { error: 'You cannot make yourself view-only — you own the module.' },
      { status: 400 },
    )
  }

  const { data, error: dbError } = await admin
    .from('module_access').update({ role }).eq('id', id).select('id, role').single()
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 })
  return NextResponse.json(data)
}

// DELETE — revoke a grant by its row id.
export async function DELETE(req: NextRequest) {
  const { profile, error } = await requireModuleGrantor(MODULE)
  if (error || !profile) return error!

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: grant } = await admin
    .from('module_access')
    .select('user_id')
    .eq('id', id)
    .eq('module_key', MODULE)
    .maybeSingle()
  if (!grant) return NextResponse.json({ error: 'No such grant' }, { status: 404 })

  // The grantor cannot revoke themselves: they are the only account that can
  // grant, so doing so would lock the module and require a SQL fix to reopen.
  if (grant.user_id === profile.id) {
    return NextResponse.json(
      { error: 'You cannot revoke your own access — you are the only account that can grant it.' },
      { status: 400 },
    )
  }

  const { error: dbError } = await admin.from('module_access').delete().eq('id', id)
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
