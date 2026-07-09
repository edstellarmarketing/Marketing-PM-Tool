import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser, getProfile, requireAdminOrTeamLead, canManageProject } from '@/lib/api'

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  group_id: z.string().uuid().nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  category: z.string().max(60).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['pending', 'in_progress', 'completed']).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  start_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  dependency_task: z.string().max(200).nullable().optional(),
  dependency_details: z.string().max(2000).nullable().optional(),
  dependency_status: z.string().max(60).nullable().optional(),
  dependency_owner_id: z.string().uuid().nullable().optional(),
  dependency_owner_ids: z.array(z.string().uuid()).max(50).nullable().optional(),
  final_comments: z.string().max(4000).nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, error } = await getAuthUser()
  if (error || !user) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const payload: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.dependency_owner_ids !== undefined) {
    const arr = parsed.data.dependency_owner_ids
    payload.dependency_owner_ids = arr && arr.length > 0 ? arr : null
    payload.dependency_owner_id = arr && arr.length > 0 ? arr[0] : null
  }

  // Who may edit a project task: the task's assignee or creator (their own work),
  // admins, or a team lead managing the parent project. Project managers edit via
  // the service-role client (RLS only permits assignee/creator/admin); everyone
  // else still goes through RLS so they can only touch their own rows.
  const admin = createAdminClient()
  const { data: taskRow } = await admin
    .from('project_tasks')
    .select('project_id, created_by, assignee_id')
    .eq('id', id)
    .single()
  if (!taskRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const profile = await getProfile(user.id)
  const isManager = !!profile && await canManageProject(profile, taskRow.project_id)
  const isOwnRow = taskRow.created_by === user.id || taskRow.assignee_id === user.id
  if (!isManager && !isOwnRow) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // A non-null group must belong to the same project as the task.
  if (parsed.data.group_id) {
    const { data: group } = await admin
      .from('project_task_groups')
      .select('id')
      .eq('id', parsed.data.group_id)
      .eq('project_id', taskRow.project_id)
      .maybeSingle()
    if (!group) return NextResponse.json({ error: 'Invalid group for this project' }, { status: 400 })
  }

  const client = isManager ? admin : await createClient()
  const { data, error: dbError } = await client
    .from('project_tasks')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { profile, error } = await requireAdminOrTeamLead()
  if (error || !profile) return error ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createAdminClient()

  // Team leads may delete project tasks only within a project they created.
  const { data: row } = await supabase.from('project_tasks').select('project_id').eq('id', id).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await canManageProject(profile, row.project_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: dbError } = await supabase.from('project_tasks').delete().eq('id', id)
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
