import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModuleManager } from '@/lib/api'
import { friendlyDbError, LOOKUP_TABLES, validationResponse } from '@/lib/expenses'

// Create a lookup value. Ledger managers and the owner both may — the person
// entering expenses is the one who hits a missing vendor or link type.
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
})

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

export async function POST(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params
  const cfg = LOOKUP_TABLES[type]
  if (!cfg) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { profile, error } = await requireModuleManager('expenses')
  if (error || !profile) return error!

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(validationResponse(parsed.error), { status: 400 })

  const name = parsed.data.name
  const db = createAdminClient()

  const payload: Record<string, unknown> = { name }
  if (cfg.hasSlug) {
    payload.slug = slugify(name) || `category-${Date.now()}`
    // New categories sort after the nine seeded ones rather than jumping the
    // Summary-sheet order the matrix depends on.
    const { data: last } = await db
      .from(cfg.table).select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
    payload.sort_order = ((last as { sort_order?: number } | null)?.sort_order ?? 0) + 1
  }

  const { data, error: dbError } = await db
    .from(cfg.table).insert(payload).select('id, name, is_active, created_at').single()

  if (!dbError) return NextResponse.json(data, { status: 201 })

  // 23505 = the UNIQUE index on lower(name). Return the canonical row rather
  // than an error — typing an existing name in different case should resolve to
  // what is already there, which is what that index exists for.
  if (dbError.code === '23505') {
    const { data: existing } = await db
      .from(cfg.table).select('id, name, is_active, created_at').ilike('name', name).maybeSingle()
    if (existing) return NextResponse.json({ ...existing, already_existed: true })
  }
  return NextResponse.json({ error: friendlyDbError(dbError) }, { status: 400 })
}
