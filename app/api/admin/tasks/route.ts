import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminOrTeamLead, departmentUserIds } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { profile, error } = await requireAdminOrTeamLead()
  if (error) return error

  const adminClient = createAdminClient()
  let query = adminClient
    .from('tasks')
    .select('id, title, description, status, priority, category, task_type, complexity, start_date, due_date, completion_date, score_weight, score_earned, approval_status, scoring_locked, assigned_by, created_at, user_id')
    .order('created_at', { ascending: false })
    .limit(1000)

  // Team leads see only tasks owned by members of their own department.
  if (profile!.role === 'team_lead') {
    query = query.in('user_id', await departmentUserIds(profile!.department))
  }

  const { data, error: dbError } = await query
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
