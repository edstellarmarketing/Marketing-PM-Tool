import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('user_awards')
    .select('*, award_types(id,name,icon,bonus_points)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch profiles separately to avoid join issues
  const userIds = [...new Set((data ?? []).map((r: Record<string, unknown>) => r.user_id as string))]
  const { data: profiles } = userIds.length > 0
    ? await admin.from('profiles').select('id,full_name,avatar_url').in('id', userIds)
    : { data: [] }
  const profileMap = Object.fromEntries((profiles ?? []).map((p: Record<string, unknown>) => [p.id, p]))

  const enriched = (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    profile: profileMap[r.user_id as string] ?? null,
  }))

  return NextResponse.json(enriched)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (adminProfile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { user_id, award_type_id, task_id, note, month, year } = body
  if (!user_id || !award_type_id || !month || !year) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Get snapshot of bonus_points from award type
  const { data: awardType, error: atErr } = await admin
    .from('award_types')
    .select('bonus_points')
    .eq('id', award_type_id)
    .single()

  if (atErr || !awardType) return NextResponse.json({ error: 'Award type not found' }, { status: 404 })

  const snapshotPoints = (awardType as { bonus_points: number }).bonus_points

  // Insert the award
  const { data: award, error: insertErr } = await admin
    .from('user_awards')
    .insert({
      user_id,
      award_type_id,
      task_id: task_id || null,
      awarded_by: user.id,
      note: note || null,
      bonus_points: snapshotPoints,
      month: Number(month),
      year: Number(year),
    })
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  // Increment bonus_points in monthly_scores (upsert then add)
  const { data: existing } = await admin
    .from('monthly_scores')
    .select('id, bonus_points')
    .eq('user_id', user_id)
    .eq('month', Number(month))
    .eq('year', Number(year))
    .single()

  if (existing) {
    await admin
      .from('monthly_scores')
      .update({ bonus_points: ((existing as { bonus_points: number }).bonus_points ?? 0) + snapshotPoints })
      .eq('id', (existing as { id: string }).id)
  } else {
    await admin
      .from('monthly_scores')
      .insert({
        user_id,
        month: Number(month),
        year: Number(year),
        bonus_points: snapshotPoints,
        total_tasks: 0,
        completed_tasks: 0,
        score_earned: 0,
        score_possible: 0,
        completion_rate: 0,
      })
  }

  return NextResponse.json(award, { status: 201 })
}
