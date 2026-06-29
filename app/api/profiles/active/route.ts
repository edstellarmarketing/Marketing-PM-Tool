import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminOrTeamLead } from '@/lib/api'

export async function GET() {
  const { profile, error } = await requireAdminOrTeamLead()
  if (error) return error

  const adminClient = createAdminClient()
  let query = adminClient
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'member')
    .eq('is_active', true)
    .order('full_name')

  // Team leads only see members of their own department in pickers.
  if (profile!.role === 'team_lead') query = query.eq('department', profile!.department ?? '__none__')

  const { data, error: dbError } = await query
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}
