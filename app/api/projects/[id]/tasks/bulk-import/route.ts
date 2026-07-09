import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminOrTeamLead, canManageProject } from '@/lib/api'

// Project-level bulk import. Unlike the per-owner endpoint, the destination
// owner (department) is OPTIONAL — omit it and tasks import unassigned, to be
// sorted into departments/groups later. Only a title is required per row.
const rowSchema = z.object({
  title: z.string().min(1).max(200),
  group_id: z.string().uuid().nullable().optional(),
  description: z.string().max(8000).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  status: z.enum(['pending', 'in_progress', 'completed']).default('pending'),
  progress: z.number().int().min(0).max(100).default(0),
  start_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  dependency_task: z.string().max(200).nullable().optional(),
  dependency_details: z.string().max(2000).nullable().optional(),
  dependency_status: z.string().max(60).nullable().optional(),
  dependency_owner_id: z.string().uuid().nullable().optional(),
  dependency_owner_ids: z.array(z.string().uuid()).max(50).nullable().optional(),
  final_comments: z.string().max(4000).nullable().optional(),
  sort_order: z.number().int().min(0).max(1_000_000).nullable().optional(),
})

const bodySchema = z.object({
  // Applies to every row in this request. null = leave tasks unassigned.
  owner_id: z.string().uuid().nullable().optional(),
  rows: z.array(rowSchema).min(1).max(500),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const { profile, error } = await requireAdminOrTeamLead()
  if (error || !profile) return error ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await canManageProject(profile, projectId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = createAdminClient()

  // Resolve the optional destination owner (for owner_id + category).
  let ownerId: string | null = null
  let category: string | null = null
  if (parsed.data.owner_id) {
    const { data: owner } = await supabase
      .from('project_owners')
      .select('id, department, project_id')
      .eq('id', parsed.data.owner_id)
      .maybeSingle()
    if (!owner || owner.project_id !== projectId) {
      return NextResponse.json({ error: 'Invalid owner for this project' }, { status: 400 })
    }
    ownerId = owner.id
    category = owner.department
  }

  // Validate referenced groups belong to this project; drop unknown ids to null.
  const requestedGroupIds = Array.from(
    new Set(parsed.data.rows.map(r => r.group_id).filter((g): g is string => !!g)),
  )
  const validGroupIds = new Set<string>()
  if (requestedGroupIds.length > 0) {
    const { data: groups } = await supabase
      .from('project_task_groups')
      .select('id')
      .eq('project_id', projectId)
      .in('id', requestedGroupIds)
    ;(groups ?? []).forEach((g: { id: string }) => validGroupIds.add(g.id))
  }

  // Append after the project's existing tasks, preserving the sent order.
  const { data: maxRow } = await supabase
    .from('project_tasks')
    .select('sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  const baseSortOrder = maxRow?.sort_order ?? 0

  const inserts = parsed.data.rows.map((r, i) => ({
    project_id: projectId,
    owner_id: ownerId,
    group_id: r.group_id && validGroupIds.has(r.group_id) ? r.group_id : null,
    title: r.title,
    description: r.description ?? null,
    category,
    priority: r.priority,
    status: r.status,
    progress: r.progress,
    start_date: r.start_date || null,
    due_date: r.due_date || null,
    dependency_task: r.dependency_task ?? null,
    dependency_details: r.dependency_details ?? null,
    dependency_status: r.dependency_status ?? null,
    dependency_owner_id: r.dependency_owner_ids?.[0] ?? r.dependency_owner_id ?? null,
    dependency_owner_ids: r.dependency_owner_ids?.length ? r.dependency_owner_ids : null,
    final_comments: r.final_comments ?? null,
    sort_order: baseSortOrder + i + 1,
    created_by: profile.id,
  }))

  const { error: dbError } = await supabase.from('project_tasks').insert(inserts)
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ inserted: inserts.length }, { status: 201 })
}
