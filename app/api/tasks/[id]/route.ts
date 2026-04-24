import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/api'
import { z } from 'zod'

const subTaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  completed: z.boolean().default(false),
  due_date: z.string().nullable().optional(),
})

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullish(),
  category: z.string().nullish(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['todo', 'in_progress', 'review', 'done', 'blocked']).optional(),
  task_type: z.string().nullish(),
  complexity: z.string().nullish(),
  start_date: z.string().nullish(),
  due_date: z.string().nullish(),
  completion_date: z.string().nullish(),
  plan_id: z.string().uuid().nullish(),
  goal_id: z.string().nullish(),
  is_draft: z.boolean().optional(),
  strategic_notes: z.string().nullish(),
  subtasks: z.array(subTaskSchema).nullish(),
  action: z.enum(['approve_dependency', 'reject_dependency']).optional(),
  note: z.string().max(2000).optional(),
  // score_weight and score_earned are system-calculated — stripped from all client payloads
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await getAuthUser()
  if (error) return error

  const supabase = await createClient()
  const { data, error: dbError } = await supabase
    .from('tasks')
    .select('*, task_updates(*), children:tasks(*)')
    .eq('id', id)
    .single()

  if (dbError) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, error } = await getAuthUser()
  if (error) return error

  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Use adminClient so task owners can approve/reject dependency tasks they don't personally own
  const { data: existing } = await adminClient
    .from('tasks')
    .select('approval_status, user_id, score_weight, status, start_date, due_date, parent_task_id, title, assigned_by, scoring_locked')
    .eq('id', id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const isAdmin = profile?.role === 'admin'

  const body = await req.json()
  const parsed = updateTaskSchema.safeParse(body)
  if (!parsed.success) {
    console.error('Validation error:', parsed.error.format())
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Handle owner/assigner approval or rejection
  if (parsed.data.action === 'approve_dependency' || parsed.data.action === 'reject_dependency') {
    // Authorized if: parent task is owned by this user, OR the task was directly assigned by this user
    let authorized = false
    if (existing.parent_task_id) {
      const { data: parent } = await adminClient.from('tasks').select('user_id').eq('id', existing.parent_task_id).single()
      if (parent && parent.user_id === user!.id) authorized = true
    }
    if (!authorized && existing.assigned_by === user!.id) authorized = true

    if (!authorized) {
      return NextResponse.json({ error: 'Unauthorized. You can only review tasks you assigned or dependency tasks of your main tasks.' }, { status: 401 })
    }

    const isApproveDep = parsed.data.action === 'approve_dependency'
    const updates: Record<string, unknown> = {
      approval_status: 'approved',
      approved_by: user!.id,
      approved_at: new Date().toISOString(),
      approval_note: parsed.data.note ?? null,
    }
    if (!isApproveDep) {
      updates.status = 'in_progress'
      updates.completion_date = null
      updates.score_earned = 0
    }

    const { data, error: approveError } = await adminClient
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (approveError) return NextResponse.json({ error: approveError.message }, { status: 500 })

    await adminClient.from('notifications').insert({
      user_id: data.user_id,
      sender_id: user!.id,
      title: isApproveDep ? 'Score confirmed' : 'Completion rejected',
      body: parsed.data.note
        ? `Your task "${existing.title}" was ${isApproveDep ? 'approved' : 'rejected'}: ${parsed.data.note}`
        : isApproveDep
          ? `Your task "${existing.title}" score has been confirmed.`
          : `Your task "${existing.title}" was rejected and moved back to In Progress.`,
      link: `/tasks/${id}`,
    })

    return NextResponse.json(data)
  }

  // Permission check: owner or admin
  if (!isAdmin && existing.user_id !== user!.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Dependency check: if moving to done, all children must be approved
  if (parsed.data.status === 'done') {
    const { data: children } = await adminClient
      .from('tasks')
      .select('status, approval_status')
      .eq('parent_task_id', id)
    
    if (children && children.length > 0) {
      const allDone = children.every(c => c.status === 'done' && c.approval_status === 'approved')
      if (!allDone) {
        return NextResponse.json({ error: 'Cannot complete task: All linked dependencies must be done and approved by you first.' }, { status: 403 })
      }
    }
  }

  // Subtask-only updates are always allowed (toggling checklist on a done task)
  const parsedKeys = Object.keys(parsed.data)
  const isSubtasksOnly = parsedKeys.length > 0 && parsedKeys.every(k => k === 'subtasks')

  // Block editing a completed task while awaiting score approval (subtask toggles still allowed)
  if (!isAdmin && existing.approval_status === 'pending_approval' && !isSubtasksOnly) {
    return NextResponse.json({ error: 'This task is awaiting completion approval and cannot be edited.' }, { status: 403 })
  }

  // Prevent non-admins from changing task_type/complexity on completed or scoring-locked tasks
  const payload: Record<string, unknown> = { ...parsed.data }
  delete payload.action

  if (!isAdmin && (existing.status === 'done' || existing.scoring_locked)) {
    delete payload.task_type
    delete payload.complexity
  }

  // Lock start_date and due_date once the task exists — only admins can edit them.
  if (!isAdmin) {
    const changingStart = 'start_date' in parsed.data && parsed.data.start_date !== existing.start_date
    const changingDue = 'due_date' in parsed.data && parsed.data.due_date !== existing.due_date
    if (changingStart || changingDue) {
      return NextResponse.json(
        { error: 'Start date and due date are locked. Please raise a date change request for an admin to review.' },
        { status: 403 },
      )
    }
    delete payload.start_date
    delete payload.due_date
  }
  if (parsed.data.status === 'done') {
    if (!parsed.data.completion_date) {
      payload.completion_date = new Date().toISOString().split('T')[0]
    }
    // Main tasks still go to admin for final approval
    payload.approval_status = 'pending_approval'
    payload.score_earned = existing.score_weight
  }
  // Reset when task is re-opened
  if (parsed.data.status && parsed.data.status !== 'done') {
    payload.completion_date = null
    payload.approval_status = 'approved'
    payload.score_earned = 0
  }

  const { data, error: dbError } = await supabase
    .from('tasks')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (dbError) {
    console.error('Database error:', dbError)
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, error } = await getAuthUser()
  if (error) return error

  const supabase = await createClient()

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const isAdmin = profile?.role === 'admin'

  // Permission check: strictly admin-only for deletion
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized. Only admins can delete tasks.' }, { status: 401 })
  }

  // Use admin client to bypass RLS
  const adminClient = createAdminClient()
  const { error: dbError } = await adminClient.from('tasks').delete().eq('id', id)
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
