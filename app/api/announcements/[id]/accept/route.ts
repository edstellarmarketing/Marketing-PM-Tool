import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Member-side "accept" entry.
 *
 *  • user-targeted announcement: caller is in `user_ids` → row is inserted as
 *    'approved' (via the BEFORE INSERT trigger) and we create the task here.
 *  • dept-targeted announcement: caller's department is in `departments` →
 *    row stays 'requested'. The admin must approve it via
 *    /api/admin/announcements/[id]/acceptances/[acceptanceId]/approve before
 *    the task is created.
 *
 * Idempotent on a per (announcement, user) basis: a second call returns the
 * existing row's state (200) instead of erroring.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, error } = await getAuthUser()
  if (error) return error

  const admin = createAdminClient()

  const [{ data: profile }, { data: announcement }] = await Promise.all([
    admin.from('profiles').select('id, department').eq('id', user!.id).single(),
    admin.from('announcements').select('*').eq('id', id).single(),
  ])

  if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
  if (announcement.status !== 'open') {
    return NextResponse.json({ error: 'Announcement is closed.', code: 'closed' }, { status: 409 })
  }

  // Visibility check matching the RLS predicate.
  const callerDept = profile?.department?.trim()
  const inDept = !!callerDept && announcement.departments?.includes(callerDept)
  const inUserList = (announcement.user_ids ?? []).includes(user!.id)

  if (announcement.target_mode === 'department' && !inDept) {
    return NextResponse.json({ error: 'This announcement is not for your department.' }, { status: 403 })
  }
  if (announcement.target_mode === 'users' && !inUserList) {
    return NextResponse.json({ error: 'You were not tagged on this announcement.' }, { status: 403 })
  }

  // Re-entry: return existing acceptance row if any.
  const { data: existing } = await admin
    .from('announcement_acceptances')
    .select('id, status, task_id')
    .eq('announcement_id', id)
    .eq('user_id', user!.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({
      acceptance_id: existing.id,
      status: existing.status,
      task_id: existing.task_id,
      already: true,
    })
  }

  // Insert new acceptance. For user-targeted the trigger auto-sets status='approved'.
  const { data: inserted, error: insertErr } = await admin
    .from('announcement_acceptances')
    .insert({
      announcement_id: id,
      user_id: user!.id,
      status: 'requested', // trigger flips to 'approved' for target_mode='users'
    })
    .select('id, status')
    .single()

  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  // If trigger auto-approved (user-targeted), spin up the task now.
  if (inserted.status === 'approved') {
    const taskId = await createTaskFromAnnouncement(admin, announcement, user!.id)
    if (taskId) {
      await admin
        .from('announcement_acceptances')
        .update({ task_id: taskId })
        .eq('id', inserted.id)
    }

    // Notify the admin creator that their announcement was accepted.
    if (announcement.created_by && announcement.created_by !== user!.id) {
      await admin.from('notifications').insert({
        user_id: announcement.created_by,
        sender_id: user!.id,
        title: 'Announcement accepted',
        body: `"${announcement.title}" has been accepted and added to a team member's tasks.`,
        link: `/admin/announcements/${id}`,
      })
    }

    return NextResponse.json({
      acceptance_id: inserted.id,
      status: 'approved',
      task_id: taskId,
    }, { status: 201 })
  }

  // Department flow — status='requested'. Notify the announcement creator that
  // someone is requesting and needs approval.
  if (announcement.created_by && announcement.created_by !== user!.id) {
    await admin.from('notifications').insert({
      user_id: announcement.created_by,
      sender_id: user!.id,
      title: 'Acceptance request',
      body: `Someone has requested to accept "${announcement.title}". Approve them to create the task on their list.`,
      link: `/admin/announcements/${id}`,
    })
  }

  return NextResponse.json({
    acceptance_id: inserted.id,
    status: 'requested',
  }, { status: 201 })
}

/** Insert a `tasks` row mirroring the announcement. Returns the new task id (or null on error). */
async function createTaskFromAnnouncement(
  admin: ReturnType<typeof createAdminClient>,
  announcement: {
    id: string
    title: string
    description: string | null
    category: string | null
    priority: string
    task_type: string | null
    complexity: string | null
    due_date: string
    score_weight: number | null
    created_by: string
  },
  userId: string,
): Promise<string | null> {
  const { data: task, error } = await admin
    .from('tasks')
    .insert({
      user_id: userId,
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

  if (error || !task) return null
  return task.id
}
