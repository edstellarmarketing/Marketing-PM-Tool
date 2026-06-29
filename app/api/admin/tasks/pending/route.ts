import { NextResponse } from 'next/server'
import { requireAdminOrTeamLead, departmentUserIds } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const { profile, error } = await requireAdminOrTeamLead()
  if (error) return error

  const admin = createAdminClient()
  let query = admin
    .from('tasks')
    .select('*, profiles!tasks_user_id_fkey(full_name, avatar_url)')
    .eq('approval_status', 'pending_approval')
    .eq('status', 'done')
    .order('updated_at', { ascending: false })

  // Team leads only approve tasks for members of their own department.
  if (profile!.role === 'team_lead') {
    query = query.in('user_id', await departmentUserIds(profile!.department))
  }

  const { data, error: dbError } = await query
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
