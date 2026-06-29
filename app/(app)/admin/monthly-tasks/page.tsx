import { createAdminClient } from '@/lib/supabase/admin'
import { requirePageRole } from '@/lib/api'
import MonthlyTasksClient from '@/components/admin/MonthlyTasksClient'

const MIN_YEAR = 2026
const MIN_MONTH = 5

function monthKeyOf(dateStr: string): string {
  // dateStr is 'YYYY-MM-DD'; safe substring
  return dateStr.slice(0, 7)
}

export default async function MonthlyTasksPage() {
  const me = await requirePageRole(['admin', 'team_lead'])

  const adminClient = createAdminClient()
  const minDate = `${MIN_YEAR}-${String(MIN_MONTH).padStart(2, '0')}-01`

  // Team leads see only their own department's members.
  let membersQuery = adminClient
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('role', 'member')
    .eq('is_active', true)
    .order('full_name')
  if (me.role === 'team_lead') membersQuery = membersQuery.eq('department', me.department ?? '__none__')

  const [{ data: members }, { data: monthlyTaskRows }] = await Promise.all([
    membersQuery,
    adminClient
      .from('tasks')
      .select('user_id, due_date')
      .neq('is_draft', true)
      .is('parent_task_id', null)
      .not('due_date', 'is', null)
      .gte('due_date', minDate),
  ])

  const memberIds = new Set((members ?? []).map(m => m.id))

  // Group user_ids per month-key 'YYYY-MM'
  const usersByMonth: Record<string, string[]> = {}
  for (const row of monthlyTaskRows ?? []) {
    if (!row.due_date || !memberIds.has(row.user_id)) continue
    const key = monthKeyOf(row.due_date)
    const list = usersByMonth[key] ?? (usersByMonth[key] = [])
    if (!list.includes(row.user_id)) list.push(row.user_id)
  }

  return <MonthlyTasksClient members={members ?? []} usersByMonth={usersByMonth} />
}
