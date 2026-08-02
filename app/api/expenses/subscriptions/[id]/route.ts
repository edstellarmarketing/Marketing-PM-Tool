import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireExpenseDeleter, requireModuleManager } from '@/lib/api'
import { friendlyDbError, subscriptionPatchSchema, validationResponse } from '@/lib/expenses'

// Edit is open to any grant holder; delete is the module owner's alone, and soft,
// exactly as for expenses.
export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await requireModuleManager('expenses')
  if (error) return error

  const body = await req.json().catch(() => null)
  const parsed = subscriptionPatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationResponse(parsed.error), { status: 400 })
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: existing } = await db
    .from('expense_subscriptions')
    .select('id, deleted_at')
    .eq('id', id)
    .maybeSingle()
  if (!existing || existing.deleted_at) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error: dbError } = await db
    .from('expense_subscriptions')
    .update(parsed.data)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, name')
    .single()

  if (dbError) return NextResponse.json({ error: friendlyDbError(dbError) }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { profile, error } = await requireExpenseDeleter()
  if (error || !profile) return error!

  const db = createAdminClient()
  const { data: existing } = await db
    .from('expense_subscriptions')
    .select('id, deleted_at')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.deleted_at) return NextResponse.json({ error: 'Already deleted' }, { status: 409 })

  // Charges already logged against this subscription keep their history: the FK
  // is ON DELETE SET NULL and this is a soft delete anyway, so no money record
  // is touched.
  const { error: dbError } = await db
    .from('expense_subscriptions')
    .update({ deleted_at: new Date().toISOString(), deleted_by: profile.id })
    .eq('id', id)
    .is('deleted_at', null)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
