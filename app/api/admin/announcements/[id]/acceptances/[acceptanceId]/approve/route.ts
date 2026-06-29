import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrTeamLead } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Admin approves a 'requested' acceptance row on a dept-targeted announcement.
 * Creates the task for the requester and flips the row to 'approved'.
 *
 * Idempotent: if the row is already approved, returns 200 with the existing
 * task_id. If approving fails, the row stays 'requested'.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; acceptanceId: string }> },
) {
  const { id, acceptanceId } = await params
  const { profile, error } = await requireAdminOrTeamLead()
  if (error) return error

  const admin = createAdminClient()

  const [{ data: announcement }, { data: acceptance }] = await Promise.all([
    admin.from('announcements').select('*').eq('id', id).single(),
    admin
      .from('announcement_acceptances')
      .select('id, announcement_id, user_id, status, task_id')
      .eq('id', acceptanceId)
      .single(),
  ])

  if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
  // Team leads may approve acceptances only on announcements they created.
  if (profile!.role !== 'admin' && announcement.created_by !== profile!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!acceptance || acceptance.announcement_id !== id) {
    return NextResponse.json({ error: 'Acceptance row not found' }, { status: 404 })
  }

  if (acceptance.status === 'approved') {
    return NextResponse.json({
      acceptance_id: acceptance.id,
      task_id: acceptance.task_id,
      already_approved: true,
    })
  }

  // Create the task for the requester
  const { data: task, error: taskErr } = await admin
    .from('tasks')
    .insert({
      user_id: acceptance.user_id,
      title: announcement.title,
      description: announcement.description ?? null,
      category: announcement.category ?? null,
      priority: announcement.priority,
      task_type: announcement.task_type ?? null,
      complexity: announcement.complexity ?? null,
      due_date: announcement.due_date,
      status: 'todo',
      is_draft: false,
      approval_status: 'approved',
      assigned_by: announcement.created_by,
      scoring_locked: true,
      score_weight: announcement.score_weight ?? undefined,
      source_announcement_id: announcement.id,
    })
    .select('id')
    .single()

  if (taskErr || !task) {
    return NextResponse.json({ error: taskErr?.message ?? 'Failed to create task' }, { status: 500 })
  }

  // Flip the acceptance row to approved
  const { error: updErr } = await admin
    .from('announcement_acceptances')
    .update({
      status: 'approved',
      task_id: task.id,
      approved_at: new Date().toISOString(),
      approved_by: profile!.id,
    })
    .eq('id', acceptanceId)

  if (updErr) {
    // Compensating delete on the task we just created
    await admin.from('tasks').delete().eq('id', task.id)
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // Notify the requester
  await admin.from('notifications').insert({
    user_id: acceptance.user_id,
    sender_id: profile!.id,
    title: 'Announcement request approved',
    body: `Your request on "${announcement.title}" was approved — the task is now on your list.`,
    link: `/tasks/${task.id}`,
  })

  return NextResponse.json({ acceptance_id: acceptance.id, task_id: task.id }, { status: 201 })
}

/**
 * DELETE — admin rejects a 'requested' acceptance (cancels the request).
 * Removes the row entirely so the requester can re-request if circumstances change.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; acceptanceId: string }> },
) {
  const { id, acceptanceId } = await params
  const { profile, error } = await requireAdminOrTeamLead()
  if (error) return error

  const admin = createAdminClient()

  // Team leads may reject acceptances only on announcements they created.
  const { data: announcement } = await admin.from('announcements').select('created_by').eq('id', id).single()
  if (!announcement) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (profile!.role !== 'admin' && announcement.created_by !== profile!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: acceptance } = await admin
    .from('announcement_acceptances')
    .select('id, announcement_id, user_id, status, task_id')
    .eq('id', acceptanceId)
    .single()

  if (!acceptance || acceptance.announcement_id !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // If already approved, we'd be removing a real task — block to avoid surprises.
  if (acceptance.status === 'approved') {
    return NextResponse.json(
      { error: 'Already approved — delete the resulting task manually if needed.' },
      { status: 409 },
    )
  }

  const { error: delErr } = await admin
    .from('announcement_acceptances')
    .delete()
    .eq('id', acceptanceId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // Notify the requester
  await admin.from('notifications').insert({
    user_id: acceptance.user_id,
    sender_id: profile!.id,
    title: 'Acceptance request declined',
    body: `Your acceptance request was declined. Reach out to the admin if you need context.`,
  })

  return NextResponse.json({ success: true })
}
