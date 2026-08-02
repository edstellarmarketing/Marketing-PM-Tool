import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireExpenseDeleter } from '@/lib/api'

// Undo a soft delete. Owner-only, matching DELETE — whoever can remove a
// financial record is the one who can put it back.
export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  if (!existing.deleted_at) return NextResponse.json({ error: 'That entry is not deleted' }, { status: 409 })

  const { error: dbError } = await db
    .from('expenses')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', id)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
