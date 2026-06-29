import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminOrTeamLead, canManage } from '@/lib/api'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { profile, error: authError } = await requireAdminOrTeamLead()
  if (authError) return authError

  const { id } = await params
  const admin = createAdminClient()

  // Read the award row first to get snapshot points + month/year
  const { data: awardRow, error: fetchErr } = await admin
    .from('user_awards')
    .select('user_id, bonus_points, month, year')
    .eq('id', id)
    .single()

  if (fetchErr || !awardRow) return NextResponse.json({ error: 'Award not found' }, { status: 404 })

  const { user_id, bonus_points, month, year } = awardRow as {
    user_id: string; bonus_points: number; month: number; year: number
  }

  // Team leads may only revoke awards for their own department's members.
  if (!(await canManage(profile!, user_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Delete the award
  const { error: deleteErr } = await admin.from('user_awards').delete().eq('id', id)
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  // Decrement bonus_points in monthly_scores
  const { data: ms } = await admin
    .from('monthly_scores')
    .select('id, bonus_points')
    .eq('user_id', user_id)
    .eq('month', month)
    .eq('year', year)
    .single()

  if (ms) {
    const current = (ms as { bonus_points: number }).bonus_points ?? 0
    await admin
      .from('monthly_scores')
      .update({ bonus_points: Math.max(0, current - bonus_points) })
      .eq('id', (ms as { id: string }).id)
  }

  return NextResponse.json({ success: true })
}
