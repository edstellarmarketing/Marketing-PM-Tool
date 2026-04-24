import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const schema = z.object({
  action: z.enum(['approved', 'rejected']),
  note: z.string().max(2000).optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, error } = await getAuthUser()
  if (error) return error

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = createAdminClient()

  const { data: request, error: fetchError } = await admin
    .from('task_date_change_requests')
    .select('*, tasks(id, user_id, parent_task_id)')
    .eq('id', id)
    .single()

  if (fetchError || !request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (request.status !== 'pending') {
    return NextResponse.json({ error: 'This request has already been reviewed.' }, { status: 409 })
  }

  // Authorization: admin can review any request; non-admin can review only date change requests
  // for dependency tasks where they own the parent task.
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user!.id).single()
  const isAdmin = profile?.role === 'admin'

  if (!isAdmin) {
    const task = request.tasks as { id: string; user_id: string; parent_task_id: string | null } | null
    if (!task?.parent_task_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { data: parent } = await admin
      .from('tasks')
      .select('user_id')
      .eq('id', task.parent_task_id)
      .single()
    if (!parent || parent.user_id !== user!.id) {
      return NextResponse.json({ error: 'Only the main task owner can review this dependency request.' }, { status: 403 })
    }
  }

  const isApproved = parsed.data.action === 'approved'

  // On approval, apply the requested dates to the task
  if (isApproved) {
    const taskUpdate: Record<string, unknown> = {}
    if (request.requested_start_date !== null || request.current_start_date !== null) {
      taskUpdate.start_date = request.requested_start_date
    }
    if (request.requested_due_date !== null || request.current_due_date !== null) {
      taskUpdate.due_date = request.requested_due_date
    }
    if (Object.keys(taskUpdate).length > 0) {
      const { error: updateError } = await admin
        .from('tasks')
        .update(taskUpdate)
        .eq('id', request.task_id)
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  }

  const { data: updated, error: dbError } = await admin
    .from('task_date_change_requests')
    .update({
      status: isApproved ? 'approved' : 'rejected',
      reviewed_by: user!.id,
      reviewed_at: new Date().toISOString(),
      review_note: parsed.data.note ?? null,
    })
    .eq('id', id)
    .select('*, tasks(title)')
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  const title = updated?.tasks?.title ?? 'your task'
  await admin.from('notifications').insert({
    user_id: request.requested_by,
    sender_id: user!.id,
    title: isApproved ? 'Date change approved' : 'Date change rejected',
    body: parsed.data.note
      ? `Your date change request for "${title}" was ${isApproved ? 'approved' : 'rejected'}: ${parsed.data.note}`
      : isApproved
        ? `Your date change request for "${title}" was approved and the dates have been updated.`
        : `Your date change request for "${title}" was rejected.`,
    link: `/tasks/${request.task_id}`,
  })

  return NextResponse.json(updated)
}
