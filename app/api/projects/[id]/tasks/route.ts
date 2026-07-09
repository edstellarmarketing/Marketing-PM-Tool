import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/api'

const createSchema = z.object({
  owner_id: z.string().uuid(),
  group_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
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
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const { user, error } = await getAuthUser()
  if (error || !user) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createClient()

  // Confirm the owner belongs to this project, capture department for the tab label.
  const { data: owner, error: ownerErr } = await supabase
    .from('project_owners')
    .select('id, department, project_id')
    .eq('id', parsed.data.owner_id)
    .single()

  if (ownerErr || !owner || owner.project_id !== projectId) {
    return NextResponse.json({ error: 'Invalid owner for this project' }, { status: 400 })
  }

  // If a group is given, it must belong to this project.
  if (parsed.data.group_id) {
    const { data: group } = await supabase
      .from('project_task_groups')
      .select('id')
      .eq('id', parsed.data.group_id)
      .eq('project_id', projectId)
      .maybeSingle()
    if (!group) return NextResponse.json({ error: 'Invalid group for this project' }, { status: 400 })
  }

  // Newly-created tasks land at the end of the project's order.
  const { data: maxRow } = await supabase
    .from('project_tasks')
    .select('sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  const nextSortOrder = (maxRow?.sort_order ?? 0) + 1

  const { data, error: dbError } = await supabase
    .from('project_tasks')
    .insert({
      project_id: projectId,
      owner_id: owner.id,
      group_id: parsed.data.group_id ?? null,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      category: owner.department,
      priority: parsed.data.priority,
      status: parsed.data.status,
      progress: parsed.data.progress,
      start_date: parsed.data.start_date || null,
      due_date: parsed.data.due_date || null,
      dependency_task: parsed.data.dependency_task ?? null,
      dependency_details: parsed.data.dependency_details ?? null,
      dependency_status: parsed.data.dependency_status ?? null,
      dependency_owner_id: parsed.data.dependency_owner_ids?.[0] ?? parsed.data.dependency_owner_id ?? null,
      dependency_owner_ids: parsed.data.dependency_owner_ids?.length ? parsed.data.dependency_owner_ids : null,
      final_comments: parsed.data.final_comments ?? null,
      sort_order: nextSortOrder,
      created_by: user.id,
    })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
