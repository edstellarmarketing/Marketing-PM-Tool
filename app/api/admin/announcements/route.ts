import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminOrTeamLead, departmentUserIds } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  target_mode: z.enum(['department', 'users']).default('department'),
  departments: z.array(z.string().min(1)).max(20).default([]),
  user_ids: z.array(z.string().uuid()).max(200).default([]),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  task_type: z.string().optional(),
  complexity: z.string().optional(),
  category: z.string().optional(),
  award_type_id: z.string().uuid().nullable().optional(),
  bonus_points: z.number().int().min(0).max(10_000).default(0),
  score_weight: z.number().int().min(0).max(10_000).nullable().optional(),
}).refine(d => d.target_mode === 'department' ? d.departments.length > 0 : d.user_ids.length > 0, {
  message: 'Pick at least one department (department mode) or at least one user (user mode).',
})

export async function GET(req: NextRequest) {
  const { profile, error } = await requireAdminOrTeamLead()
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

  // Team leads manage only the announcements they created.
  if (profile!.role === 'team_lead') query = query.eq('created_by', profile!.id)

  const { data, error: dbError } = await query
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { profile, error } = await requireAdminOrTeamLead()
  if (error) return error

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const input = parsed.data

  // Team leads may post only to their own department (department mode = exactly
  // their dept; users mode = only their dept's members). Org-wide / multi-dept
  // announcements stay admin-only.
  if (profile!.role === 'team_lead') {
    const dept = profile!.department
    if (!dept) return NextResponse.json({ error: 'No department assigned' }, { status: 403 })
    if (input.target_mode === 'department') {
      if (input.departments.length !== 1 || input.departments[0] !== dept) {
        return NextResponse.json({ error: 'Team leads can only post to their own department' }, { status: 403 })
      }
    } else {
      const deptIds = new Set(await departmentUserIds(dept))
      if (!input.user_ids.every(uid => deptIds.has(uid))) {
        return NextResponse.json({ error: 'Team leads can only target members of their own department' }, { status: 403 })
      }
    }
  }

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
      target_mode: input.target_mode,
      departments: input.target_mode === 'department' ? input.departments : [],
      user_ids: input.target_mode === 'users' ? input.user_ids : [],
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

  // Notification fan-out: notify the targeted audience.
  let targets: { id: string }[] = []
  if (input.target_mode === 'department') {
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('is_active', true)
      .neq('role', 'admin')
      .in('department', input.departments)
    targets = data ?? []
  } else {
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('is_active', true)
      .in('id', input.user_ids)
    targets = data ?? []
  }

  if (targets.length > 0) {
    const link = `/announcements`
    const rows = targets.map(t => ({
      user_id: t.id,
      sender_id: profile!.id,
      title: input.target_mode === 'users'
        ? 'You were tagged on a new announcement'
        : 'New announcement for your team',
      body: `"${input.title}" — ${input.target_mode === 'users' ? 'accept it to add to your tasks.' : 'request to accept and the admin will approve finalists.'}`,
      link,
    }))
    await admin.from('notifications').insert(rows)
  }

  return NextResponse.json(created, { status: 201 })
}
