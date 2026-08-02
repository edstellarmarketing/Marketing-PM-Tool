import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModuleGrantor } from '@/lib/api'

// The public report token. Owner-only in every direction: this controls a URL
// that shows company spend to anyone holding it, with no login.
export const dynamic = 'force-dynamic'

export async function GET() {
  const { error } = await requireModuleGrantor('expenses')
  if (error) return error

  const db = createAdminClient()
  const { data, error: dbError } = await db
    .from('expense_public_report')
    .select('token, enabled, rotated_at')
    .eq('id', true)
    .maybeSingle()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data ?? null)
}

// action: 'enable' | 'disable' | 'rotate'
//
// Rotating and disabling are separate on purpose. Disabling takes effect
// immediately without changing the URL, which is what you want the moment a link
// has gone somewhere it should not. Rotating invalidates the old link but means
// redistributing the new one.
export async function POST(req: Request) {
  const { profile, error } = await requireModuleGrantor('expenses')
  if (error || !profile) return error!

  const body = await req.json().catch(() => null)
  const action = body?.action

  const db = createAdminClient()
  const patch: Record<string, unknown> = {}

  if (action === 'enable') patch.enabled = true
  else if (action === 'disable') patch.enabled = false
  else if (action === 'rotate') {
    // 32 bytes of CSPRNG output — not derived from anything guessable, and long
    // enough that brute-forcing the URL is not a concern.
    patch.token = randomBytes(32).toString('hex')
    patch.rotated_at = new Date().toISOString()
    patch.rotated_by = profile.id
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const { data, error: dbError } = await db
    .from('expense_public_report')
    .update(patch)
    .eq('id', true)
    .select('token, enabled, rotated_at')
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 })
  return NextResponse.json(data)
}
