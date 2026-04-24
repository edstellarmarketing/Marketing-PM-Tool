import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/api'
import { z } from 'zod'

const patchSchema = z.object({
  action: z.enum(['submit', 'approve', 'reject']),
  approval_note: z.string().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; goalId: string }> }
) {
  const { id, goalId } = await params
  const { user, error } = await getAuthUser()
  if (error) return error

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: plan, error: fetchError } = await adminClient
    .from('monthly_plans')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

  const { action, approval_note } = parsed.data

  if (action === 'submit' && plan.user_id !== user!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (action === 'approve' || action === 'reject') {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const goals: Record<string, unknown>[] = plan.goals ?? []
  const goalIndex = goals.findIndex(g => g.id === goalId)
  if (goalIndex === -1) return NextResponse.json({ error: 'Goal not found' }, { status: 404 })

  const goal = goals[goalIndex]
  let updatedGoal: Record<string, unknown>

  if (action === 'submit') {
    updatedGoal = { ...goal, approval_status: 'pending_approval', approval_note: null }
  } else if (action === 'approve') {
    updatedGoal = { ...goal, approval_status: 'approved', approval_note: approval_note ?? null }
  } else {
    if (!approval_note?.trim()) {
      return NextResponse.json({ error: 'Rejection note is required' }, { status: 400 })
    }
    updatedGoal = { ...goal, approval_status: 'rejected', approval_note: approval_note }
  }

  const updatedGoals = [...goals]
  updatedGoals[goalIndex] = updatedGoal

  const { data, error: updateError } = await adminClient
    .from('monthly_plans')
    .update({ goals: updatedGoals })
    .eq('id', id)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json(data)
}
