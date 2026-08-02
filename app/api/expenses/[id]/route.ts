import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireExpenseDeleter, requireModuleAccess, requireModuleManager } from '@/lib/api'
import { expensePatchSchema, friendlyDbError, validationResponse } from '@/lib/expenses'

// Read and edit a single expense. Editing is open to anyone with an `expenses`
// grant (decision 2 in expenses.md): weekly batch entry produces typos, and the
// restriction that matters is on deletion, which lands in Phase 4.
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await requireModuleAccess('expenses')
  if (error) return error

  const db = createAdminClient()
  const { data } = await db.from('expenses').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { profile, error } = await requireModuleManager('expenses')
  if (error || !profile) return error!

  const body = await req.json().catch(() => null)
  const parsed = expensePatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationResponse(parsed.error), { status: 400 })

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const db = createAdminClient()

  // A soft-deleted row is not editable — it should look gone to everyone except
  // the owner's restore view. Checked explicitly so the caller gets 404 rather
  // than a silent no-op from the .is() filter on the update.
  const { data: existing } = await db
    .from('expenses')
    .select('id, deleted_at')
    .eq('id', id)
    .maybeSingle()
  if (!existing || existing.deleted_at) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error: dbError } = await db
    .from('expenses')
    .update(parsed.data)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, expense_date, amount_usd, total_usd, link_domain')
    .single()

  if (dbError) return NextResponse.json({ error: friendlyDbError(dbError) }, { status: 400 })
  return NextResponse.json(data)
}

// Soft delete — restricted to the module owner (vijay@edstellar.com), unlike
// create and edit which any grant holder may do.
//
// This is an UPDATE, not a DELETE: `expenses` grants no DELETE to
// `authenticated` and carries no DELETE policy, so rows are never destroyed by
// the app. Financial records stay recoverable, which is what makes restricting
// deletion worth anything.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { profile, error } = await requireExpenseDeleter()
  if (error || !profile) return error!

  const db = createAdminClient()
  const { data: existing } = await db
    .from('expenses')
    .select('id, deleted_at')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.deleted_at) return NextResponse.json({ error: 'Already deleted' }, { status: 409 })

  const { error: dbError } = await db
    .from('expenses')
    .update({ deleted_at: new Date().toISOString(), deleted_by: profile.id })
    .eq('id', id)
    .is('deleted_at', null)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
