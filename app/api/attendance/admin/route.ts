import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/api'

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const month  = searchParams.get('month')
  const year   = searchParams.get('year')
  const status = searchParams.get('status') // optional filter: 'pending' | 'approved' | etc.

  const adminClient = createAdminClient()

  // Build leaves query — fetch without embedded join to avoid PostgREST schema issues
  let leavesQuery = adminClient
    .from('attendance_leaves')
    .select('*')
    .order('date', { ascending: true })

  if (month && year) {
    const mNum = parseInt(month)
    const yNum = parseInt(year)
    const nextM = mNum === 12 ? 1 : mNum + 1
    const nextY = mNum === 12 ? yNum + 1 : yNum
    const mStr = mNum.toString().padStart(2, '0')
    leavesQuery = leavesQuery
      .gte('date', `${yNum}-${mStr}-01`)
      .lt('date', `${nextY}-${nextM.toString().padStart(2, '0')}-01`)
  }

  if (status) {
    leavesQuery = leavesQuery.eq('status', status)
  }

  const { data: leaves, error: leavesError } = await leavesQuery
  if (leavesError) return NextResponse.json({ error: leavesError.message }, { status: 500 })

  if (!leaves || leaves.length === 0) return NextResponse.json([])

  // Fetch profiles for the user_ids present in the result
  const userIds = [...new Set(leaves.map((l: { user_id: string }) => l.user_id))]
  const { data: profiles, error: profilesError } = await adminClient
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', userIds)

  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 })

  const profileMap = new Map((profiles ?? []).map((p: { id: string; full_name: string; avatar_url: string | null }) => [p.id, p]))

  const result = leaves.map((l: { user_id: string }) => ({
    ...l,
    profiles: profileMap.get((l as { user_id: string }).user_id) ?? null,
  }))

  return NextResponse.json(result)
}
