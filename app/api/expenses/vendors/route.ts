import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModuleManager } from '@/lib/api'
import { validationResponse, vendorCreateSchema } from '@/lib/expenses'

// Inline vendor creation. Open to anyone with an `expenses` grant, unlike
// categories/teams/verticals which are owner-managed — new tools and publishers
// appear constantly and blocking on them would stall data entry.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { error } = await requireModuleManager('expenses')
  if (error) return error

  const body = await req.json().catch(() => null)
  const parsed = vendorCreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationResponse(parsed.error), { status: 400 })

  const name = parsed.data.name
  const db = createAdminClient()

  const { data, error: dbError } = await db
    .from('expense_vendors')
    .insert({ name })
    .select('id, name, is_active, created_at')
    .single()

  if (!dbError) return NextResponse.json(data, { status: 201 })

  // 23505 = the UNIQUE index on lower(name). Return the canonical row rather
  // than an error: typing "helpab2bwriter" should resolve to the existing
  // "HelpAB2BWriter", which is the whole point of that index (expenses.md §3.3).
  if (dbError.code === '23505') {
    const { data: existing } = await db
      .from('expense_vendors')
      .select('id, name, is_active, created_at')
      .ilike('name', name)
      .maybeSingle()
    if (existing) return NextResponse.json({ ...existing, already_existed: true })
  }

  return NextResponse.json({ error: dbError.message }, { status: 400 })
}
