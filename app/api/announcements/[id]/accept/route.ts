import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Member accept flow.
 * 1. Verify caller's department is in the announcement's departments.
 * 2. Verify the announcement is still `open`.
 * 3. Insert the resulting task.
 * 4. Optimistically flip announcement to `active` (race-safe via WHERE status='open').
 * 5. If step 4 affects 0 rows (someone beat us), delete the task we just inserted and 409.
 * 6. Notify the announcement creator that their announcement was accepted.
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
    return NextResponse.json({ error: 'Already accepted by someone else.', code: 'already_accepted' }, { status: 409 })
  }

  const callerDept = profile?.department?.trim()
  if (!callerDept || !announcement.departments.includes(callerDept)) {
    return NextResponse.json({ error: 'This announcement is not for your department.' }, { status: 403 })
  }

  // Insert the resulting task. Use admin client to bypass tasks RLS for the
  // cross-user `assigned_by` field.
  const { data: task, error: taskErr } = await admin
    .from('tasks')
    .insert({
      user_id: user!.id,
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
      scoring_locked: true, // due_date is locked; lock scoring too
      score_weight: announcement.score_weight ?? undefined,
      source_announcement_id: announcement.id,
    })
    .select('id')
    .single()

  if (taskErr || !task) {
    return NextResponse.json({ error: taskErr?.message ?? 'Failed to create task' }, { status: 500 })
  }

  // Optimistic flip to 'active' — only succeeds if still open.
  const nowIso = new Date().toISOString()
  const { data: updated, error: updErr } = await admin
    .from('announcements')
    .update({
      status: 'active',
      accepted_by: user!.id,
      accepted_at: nowIso,
      accepted_task_id: task.id,
    })
    .eq('id', id)
    .eq('status', 'open')
    .select('id, created_by, title')
    .single()

  if (updErr || !updated) {
    // Race lost — clean up the task we created.
    await admin.from('tasks').delete().eq('id', task.id)
    return NextResponse.json({ error: 'Already accepted by someone else.', code: 'already_accepted' }, { status: 409 })
  }

  // Notify the admin who created the announcement.
  if (updated.created_by && updated.created_by !== user!.id) {
    await admin.from('notifications').insert({
      user_id: updated.created_by,
      sender_id: user!.id,
      title: 'Announcement accepted',
      body: `Your announcement "${updated.title}" has been accepted and added to a team member's tasks.`,
      link: `/admin/announcements/${id}`,
    })
  }

  return NextResponse.json({ task_id: task.id, announcement_id: id }, { status: 201 })
}
