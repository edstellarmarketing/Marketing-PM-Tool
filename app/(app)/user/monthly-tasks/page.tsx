import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import MonthlyTasksClient from '@/components/admin/MonthlyTasksClient'

const MIN_YEAR = 2026
const MIN_MONTH = 5

function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7)
}

export default async function MemberMonthlyTasksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Members and admins both land here; admins should use /admin/monthly-tasks instead.
  // We don't redirect — just render the member-mode UI scoped to the auth user.

  const adminClient = createAdminClient()
  const minDate = `${MIN_YEAR}-${String(MIN_MONTH).padStart(2, '0')}-01`

  const [{ data: profile }, { data: tasks }] = await Promise.all([
    adminClient
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', user.id)
      .single(),
    adminClient
      .from('tasks')
      .select('due_date')
      .eq('user_id', user.id)
      .neq('is_draft', true)
      .is('parent_task_id', null)
      .not('due_date', 'is', null)
      .gte('due_date', minDate),
  ])

  if (!profile) redirect('/dashboard')

  const usersByMonth: Record<string, string[]> = {}
  for (const row of tasks ?? []) {
    if (!row.due_date) continue
    const key = monthKeyOf(row.due_date)
    const list = usersByMonth[key] ?? (usersByMonth[key] = [])
    if (!list.includes(user.id)) list.push(user.id)
  }

  return (
    <MonthlyTasksClient
      members={[profile]}
      usersByMonth={usersByMonth}
      mode="member"
      currentUserId={user.id}
    />
  )
}
