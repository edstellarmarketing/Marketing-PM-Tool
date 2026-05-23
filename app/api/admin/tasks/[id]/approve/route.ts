import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, getAuthUser } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const schema = z.object({
  action: z.enum(['approved', 'rejected']),
  note: z.string().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await requireAdmin()
  if (error) return error

  const { user } = await getAuthUser()
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = createAdminClient()

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
  // Idempotent: skip if a user_awards row already exists for this task.
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
        // Derive month/year from the task's due_date (announcement-sourced tasks always have one).
        const due = data.due_date ? new Date(data.due_date + 'T00:00:00') : new Date()
        const { error: awardErr } = await admin.from('user_awards').insert({
          user_id: data.user_id,
          award_type_id: announcement.award_type_id,
          task_id: id,
          awarded_by: announcement.created_by ?? user!.id,
          bonus_points: announcement.bonus_points,
          month: due.getMonth() + 1,
          year: due.getFullYear(),
          note: `Auto-granted from announcement: ${announcement.title}`,
        })
        if (awardErr) {
          // Don't fail the approval if award insert fails — just log.
          // The approval itself succeeded; award can be granted manually.
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
