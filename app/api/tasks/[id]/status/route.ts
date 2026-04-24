import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/api'
import { z } from 'zod'

const statusSchema = z.object({
  status: z.enum(['todo', 'in_progress', 'review', 'done', 'blocked']),
  note: z.string().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, error } = await getAuthUser()
  if (error) return error

  const body = await req.json()
  const parsed = statusSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createClient()

  const { data: task } = await supabase.from('tasks').select('status, approval_status, score_weight, title, user_id, parent_task_id, assigned_by, subtasks').eq('id', id).single()
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const isAdmin = profile?.role === 'admin'

  // Only the assignee (task.user_id) or an admin can change status.
  // Specifically: the person who assigned a dependency task cannot move it themselves.
  if (!isAdmin && task.user_id !== user!.id) {
    return NextResponse.json(
      { error: 'Only the assignee can change the status of this task.' },
      { status: 403 },
    )
  }

  // Block status changes on tasks awaiting completion approval
  if (task.approval_status === 'pending_approval') {
    return NextResponse.json({ error: 'This task is awaiting completion approval.' }, { status: 403 })
  }

  const statusChanged = parsed.data.status !== task.status
  const hasNote = !!parsed.data.note?.trim()

  if (!statusChanged && !hasNote) return NextResponse.json({ error: 'No changes provided' }, { status: 400 })

  let returnTask: Record<string, unknown> = task

  if (statusChanged && !isAdmin && !parsed.data.note?.trim()) {
    return NextResponse.json(
      {
        error: parsed.data.status === 'done'
          ? 'Please describe the work you completed before marking this task as done.'
          : 'A comment is required when changing the task status.',
      },
      { status: 400 },
    )
  }

  if (statusChanged) {
    const updates: Record<string, unknown> = { status: parsed.data.status }

    if (parsed.data.status === 'done') {
      // Block completion until all linked dependency children are done and approved
      const adminCheck = createAdminClient()
      const { data: children } = await adminCheck
        .from('tasks')
        .select('status, approval_status')
        .eq('parent_task_id', id)
      if (children && children.length > 0) {
        const allDone = children.every(c => c.status === 'done' && c.approval_status === 'approved')
        if (!allDone) {
          return NextResponse.json(
            { error: 'Cannot complete task: all linked dependency tasks must be done and approved by you first.' },
            { status: 403 },
          )
        }
      }
      // Non-admins must complete all checklist items before marking done
      if (!isAdmin) {
        const subtasks = (task.subtasks ?? []) as Array<{ completed: boolean }>
        if (subtasks.length > 0 && !subtasks.every(s => s.completed)) {
          return NextResponse.json(
            { error: 'Cannot mark as done: all checklist items must be completed first.' },
            { status: 403 },
          )
        }
      }

      updates.completion_date = new Date().toISOString().split('T')[0]
      updates.approval_status = 'pending_approval'
      updates.score_earned = task.score_weight
    } else {
      // Re-opening: clear completion, reset approval, zero out score
      updates.completion_date = null
      updates.approval_status = 'approved'
      updates.score_earned = 0
    }

    const { data: updatedTask, error: updateError } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    returnTask = updatedTask

    // Route the completion notification to the right reviewer:
    // - Tasks assigned by someone else → notify only that assigner (they approve, not admin)
    // - Self-created tasks (no assigner) → notify all admins
    if (parsed.data.status === 'done') {
      const adminClient = createAdminClient()
      const isAssignedByOther = !!(task.assigned_by && task.assigned_by !== task.user_id)

      if (isAssignedByOther) {
        await adminClient.from('notifications').insert({
          user_id: task.assigned_by!,
          sender_id: user!.id,
          title: 'Task completed by assignee',
          body: `"${task.title}" has been marked as done by the assignee and is awaiting your approval.`,
          link: `/tasks/${id}`,
        })
      } else {
        const { data: admins } = await adminClient.from('profiles').select('id').eq('role', 'admin')
        if (admins?.length) {
          await adminClient.from('notifications').insert(
            admins.map(a => ({
              user_id: a.id,
              sender_id: user!.id,
              title: 'Task completion pending approval',
              body: `"${task.title}" was marked done and needs score approval.`,
              link: `/tasks/${id}`,
            }))
          )
        }
      }
    }
  }

  await supabase.from('task_updates').insert({
    task_id: id,
    user_id: user!.id,
    old_status: task.status,
    new_status: parsed.data.status,
    note: parsed.data.note?.trim() ?? null,
  })

  return NextResponse.json(returnTask)
}
