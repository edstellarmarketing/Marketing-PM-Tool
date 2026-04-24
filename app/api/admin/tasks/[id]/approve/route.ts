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
