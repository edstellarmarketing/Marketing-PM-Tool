import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  departments: z.array(z.string().min(1)).min(1).max(20),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  task_type: z.string().optional(),
  complexity: z.string().optional(),
  category: z.string().optional(),
  award_type_id: z.string().uuid().nullable().optional(),
  bonus_points: z.number().int().min(0).max(10_000).default(0),
  score_weight: z.number().int().min(0).max(10_000).nullable().optional(),
})

export async function GET(req: NextRequest) {
  const { profile, error } = await requireAdmin()
  if (error) return error

  const url = new URL(req.url)
  const status = url.searchParams.get('status')        // 'open' | 'active' | null
  const dept = url.searchParams.get('department')      // single dept filter (uses array containment)
  const awardId = url.searchParams.get('award_type_id')

  const admin = createAdminClient()
  let query = admin
    .from('announcements')
    .select('id, title, description, departments, due_date, priority, task_type, complexity, category, award_type_id, bonus_points, score_weight, status, accepted_by, accepted_at, accepted_task_id, created_by, created_at, expires_at, award_types(name, icon, bonus_points)')
    .order('created_at', { ascending: false })

  if (status === 'open' || status === 'active') query = query.eq('status', status)
  if (dept) query = query.contains('departments', [dept])
  if (awardId) query = query.eq('award_type_id', awardId)

  const { data, error: dbError } = await query
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  void profile
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { profile, error } = await requireAdmin()
  if (error) return error

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const input = parsed.data

  const admin = createAdminClient()

  // Optional: if award_type_id is provided, sanity-check it exists & is active.
  if (input.award_type_id) {
    const { data: awardRow } = await admin
      .from('award_types')
      .select('id, is_active')
      .eq('id', input.award_type_id)
      .single()
    if (!awardRow || awardRow.is_active === false) {
      return NextResponse.json({ error: 'Selected award type does not exist or is inactive.' }, { status: 400 })
    }
  }

  const { data: created, error: insertErr } = await admin
    .from('announcements')
    .insert({
      title: input.title,
      description: input.description ?? null,
      departments: input.departments,
      due_date: input.due_date,
      priority: input.priority,
      task_type: input.task_type ?? null,
      complexity: input.complexity ?? null,
      category: input.category ?? null,
      award_type_id: input.award_type_id ?? null,
      bonus_points: input.bonus_points,
      score_weight: input.score_weight ?? null,
      created_by: profile!.id,
    })
    .select()
    .single()

  if (insertErr || !created) {
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  // Notification fan-out (Q4): notify every active member whose department is in the target list.
  const { data: targets } = await admin
    .from('profiles')
    .select('id')
    .eq('is_active', true)
    .neq('role', 'admin')
    .in('department', input.departments)

  if (targets && targets.length > 0) {
    const link = `/announcements`
    const rows = targets.map(t => ({
      user_id: t.id,
      sender_id: profile!.id,
      title: 'New announcement for your team',
      body: `"${input.title}" — accept it to add to your tasks.`,
      link,
    }))
    await admin.from('notifications').insert(rows)
  }

  return NextResponse.json(created, { status: 201 })
}
