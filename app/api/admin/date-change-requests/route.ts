import { NextResponse } from 'next/server'
import { requireAdminOrTeamLead, departmentUserIds } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const { profile, error } = await requireAdminOrTeamLead()
  if (error) return error

  const admin = createAdminClient()
  const { data, error: dbError } = await admin
    .from('task_date_change_requests')
    .select('*, tasks(id, title, user_id, start_date, due_date), requester:profiles!task_date_change_requests_requested_by_fkey(full_name, avatar_url)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  // Team leads only see requests for tasks owned by their own department.
  let rows = data ?? []
  if (profile!.role === 'team_lead') {
    const ids = new Set(await departmentUserIds(profile!.department))
    rows = rows.filter((r: { tasks?: { user_id?: string } | null }) => r.tasks?.user_id && ids.has(r.tasks.user_id))
  }
  return NextResponse.json(rows)
}
