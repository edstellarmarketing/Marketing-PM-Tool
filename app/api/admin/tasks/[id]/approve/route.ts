import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrTeamLead, canManage } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const schema = z.object({
  action: z.enum(['approved', 'rejected']),
  note: z.string().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { profile, error } = await requireAdminOrTeamLead()
  if (error) return error

  const user = { id: profile!.id }
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = createAdminClient()

  // A team lead may only approve tasks owned by members of their department.
  const { data: taskOwner } = await admin.from('tasks').select('user_id').eq('id', id).single()
  if (!taskOwner) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  if (!(await canManage(profile!, taskOwner.user_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const isApproved = parsed.data.action === 'approved'

  const updatePayload: Record<string, unknown> = {
    approval_status: 'approved', // confirmed (approved) or reverted-to-active (rejected)
    approved_by: user!.id,
    approved_at: new Date().toISOString(),
    approval_note: parsed.data.note ?? null,
  }

  if (!isApproved) {
    // Rejection: revert task to in_progress, clear score and completion
    updatePayload.status = 'in_progress'
    updatePayload.completion_date = null
    updatePayload.score_earned = 0
  }

  const { data, error: dbError } = await admin
    .from('tasks')
    .update(updatePayload)
    .eq('id', id)
    .select('*, profiles!tasks_user_id_fkey(full_name)')
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  // Auto-grant the announcement reward when an announcement-sourced task is approved.
  // Multi-accept: bonus_points is split equally among all CURRENTLY approved
  // acceptances on this announcement. Each accepter's task gets floor(bonus/N)
  // at its own approval time. Idempotent per (task, award_type).
  if (isApproved && data.source_announcement_id) {
    const { data: announcement } = await admin
      .from('announcements')
      .select('id, title, award_type_id, bonus_points, created_by')
      .eq('id', data.source_announcement_id)
      .single()

    if (announcement?.award_type_id && (announcement.bonus_points ?? 0) > 0) {
      const { count: existingCount } = await admin
        .from('user_awards')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', id)
        .eq('award_type_id', announcement.award_type_id)

      if ((existingCount ?? 0) === 0) {
        // Count approved acceptances NOW — this is the split denominator.
        const { count: approvedCount } = await admin
          .from('announcement_acceptances')
          .select('id', { count: 'exact', head: true })
          .eq('announcement_id', announcement.id)
          .eq('status', 'approved')

        const n = Math.max(1, approvedCount ?? 1)
        const sharedBonus = Math.floor(announcement.bonus_points / n)

        const due = data.due_date ? new Date(data.due_date + 'T00:00:00') : new Date()
        const splitNote = n > 1
          ? `Auto-granted from announcement: ${announcement.title} (split ${n} ways)`
          : `Auto-granted from announcement: ${announcement.title}`

        const { error: awardErr } = await admin.from('user_awards').insert({
          user_id: data.user_id,
          award_type_id: announcement.award_type_id,
          task_id: id,
          awarded_by: announcement.created_by ?? user!.id,
          bonus_points: sharedBonus,
          month: due.getMonth() + 1,
          year: due.getFullYear(),
          note: splitNote,
        })
        if (awardErr) {
          console.error('Failed to auto-grant announcement award:', awardErr.message)
        }
      }
    }
  }

  const actionLabel = isApproved ? 'score confirmed' : 'completion rejected'
  await admin.from('notifications').insert({
    user_id: data.user_id,
    sender_id: user!.id,
    title: isApproved ? 'Score confirmed' : 'Completion rejected',
    body: parsed.data.note
      ? `Your task "${data.title}" completion was ${actionLabel}: ${parsed.data.note}`
      : isApproved
        ? `Your task "${data.title}" score has been confirmed.`
        : `Your task "${data.title}" was rejected and moved back to In Progress.`,
    link: `/tasks/${id}`,
  })

  return NextResponse.json(data)
}
