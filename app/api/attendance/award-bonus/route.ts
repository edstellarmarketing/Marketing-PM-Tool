import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/api'
import { z } from 'zod'

const awardBonusSchema = z.object({
  month: z.number().int().min(1).max(12),
  year:  z.number().int().min(2024).max(2030),
})

export async function POST(req: NextRequest) {
  const { profile, error } = await requireAdmin()
  if (error || !profile) return error ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = awardBonusSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { month, year } = parsed.data

  // Next month for crediting
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year

  const adminClient = createAdminClient()

  // Get all active members
  const { data: members, error: membersError } = await adminClient
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'member')
    .eq('is_active', true)

  if (membersError) return NextResponse.json({ error: membersError.message }, { status: 500 })

  // Get all leaves for the month
  const mStr = month.toString().padStart(2, '0')
  const { data: leaves, error: leavesError } = await adminClient
    .from('attendance_leaves')
    .select('user_id')
    .gte('date', `${year}-${mStr}-01`)
    .lte('date', `${year}-${mStr}-31`)

  if (leavesError) return NextResponse.json({ error: leavesError.message }, { status: 500 })

  // Get the Perfect Attendance award type id
  const { data: awardType, error: awardTypeError } = await adminClient
    .from('award_types')
    .select('id, bonus_points')
    .eq('name', 'Perfect Attendance')
    .single()

  if (awardTypeError || !awardType) {
    return NextResponse.json({ error: 'Perfect Attendance award type not found' }, { status: 500 })
  }

  // Check existing awards for this month to avoid double-awarding
  const { data: existingAwards } = await adminClient
    .from('user_awards')
    .select('user_id')
    .eq('award_type_id', awardType.id)
    .eq('month', nextMonth)
    .eq('year', nextYear)

  const alreadyAwarded = new Set((existingAwards ?? []).map((a: { user_id: string }) => a.user_id))
  const usersWithLeaves = new Set((leaves ?? []).map((l: { user_id: string }) => l.user_id))

  const eligible = (members ?? []).filter(
    (m: { id: string }) => !usersWithLeaves.has(m.id) && !alreadyAwarded.has(m.id)
  )

  if (eligible.length === 0) {
    return NextResponse.json({ awarded: 0, skipped: (members ?? []).length, message: 'No eligible users' })
  }

  // Insert user_awards for each eligible user
  const awards = eligible.map((m: { id: string }) => ({
    user_id:       m.id,
    award_type_id: awardType.id,
    awarded_by:    profile!.id,
    bonus_points:  awardType.bonus_points,
    month:         nextMonth,
    year:          nextYear,
    note:          `Perfect attendance in ${month}/${year}`,
  }))

  const { error: insertError } = await adminClient.from('user_awards').insert(awards)
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  // Update or insert monthly_scores bonus_points for next month
  for (const m of eligible as Array<{ id: string }>) {
    const { data: existingScore } = await adminClient
      .from('monthly_scores')
      .select('id, bonus_points')
      .eq('user_id', m.id)
      .eq('month', nextMonth)
      .eq('year', nextYear)
      .single()

    if (existingScore) {
      await adminClient
        .from('monthly_scores')
        .update({ bonus_points: existingScore.bonus_points + awardType.bonus_points })
        .eq('id', existingScore.id)
    } else {
      await adminClient.from('monthly_scores').insert({
        user_id:         m.id,
        month:           nextMonth,
        year:            nextYear,
        total_tasks:     0,
        completed_tasks: 0,
        score_earned:    0,
        score_possible:  0,
        completion_rate: 0,
        bonus_points:    awardType.bonus_points,
        rank:            null,
      })
    }
  }

  return NextResponse.json({
    awarded:       eligible.length,
    skipped:       (members ?? []).length - eligible.length,
    eligible_users: (eligible as Array<{ id: string; full_name: string }>).map(m => ({ id: m.id, full_name: m.full_name })),
  })
}
