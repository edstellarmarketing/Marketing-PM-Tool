import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Member-facing list. Returns:
 *  - All `open` announcements whose departments include the caller's department,
 *  - PLUS any announcement the caller has personally accepted.
 *
 * Admins viewing this route also pass through here — they'll get all of their
 * department's open announcements (handy for testing). The dedicated admin list
 * lives at /api/admin/announcements.
 */
export async function GET(_req: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error) return error

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('department')
    .eq('id', user!.id)
    .single()

  const dept = profile?.department?.trim() || null
  if (!dept) {
    // No department on the caller — they have nothing to see.
    return NextResponse.json([])
  }

  const selectCols = 'id, title, description, departments, due_date, priority, task_type, complexity, category, award_type_id, bonus_points, score_weight, status, accepted_by, accepted_at, accepted_task_id, created_by, created_at, expires_at, award_types(name, icon, bonus_points)'

  const [openRes, mineRes] = await Promise.all([
    admin
      .from('announcements')
      .select(selectCols)
      .eq('status', 'open')
      .contains('departments', [dept])
      .order('created_at', { ascending: false }),
    admin
      .from('announcements')
      .select(selectCols)
      .eq('accepted_by', user!.id)
      .order('accepted_at', { ascending: false }),
  ])

  if (openRes.error) return NextResponse.json({ error: openRes.error.message }, { status: 500 })
  if (mineRes.error) return NextResponse.json({ error: mineRes.error.message }, { status: 500 })

  return NextResponse.json({
    open: openRes.data ?? [],
    accepted: mineRes.data ?? [],
  })
}
