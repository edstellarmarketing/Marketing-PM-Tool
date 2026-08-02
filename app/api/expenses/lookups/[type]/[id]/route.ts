import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModuleManager } from '@/lib/api'
import { friendlyDbError, LOOKUP_TABLES, validationResponse } from '@/lib/expenses'

// Rename a lookup, or retire it with is_active = false. Ledger managers and the
// owner both may.
//
// There is no DELETE. A lookup with history behind it must keep resolving —
// deleting a vendor would blank the vendor on every expense that pointed at it.
// Retiring hides it from pickers while leaving existing rows intact, which is
// also what makes this safe to hand to managers.
export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200).optional(),
  is_active: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params
  const cfg = LOOKUP_TABLES[type]
  if (!cfg) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { profile, error } = await requireModuleManager('expenses')
  if (error || !profile) return error!

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationResponse(parsed.error), { status: 400 })
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data, error: dbError } = await db
    .from(cfg.table)
    .update(parsed.data)
    .eq('id', id)
    .select('id, name, is_active')
    .single()

  if (dbError) {
    if (dbError.code === '23505') {
      return NextResponse.json({ error: 'Another entry already uses that name.' }, { status: 409 })
    }
    return NextResponse.json({ error: friendlyDbError(dbError) }, { status: 400 })
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}
