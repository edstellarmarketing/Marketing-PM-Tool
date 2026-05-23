import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound, redirect } from 'next/navigation'
import MonthUserClient, { type MonthlyTaskRow, type MonthlyScoreSummary, type MonthAwardRow } from '@/components/admin/MonthUserClient'

const MIN_YEAR = 2026
const MIN_MONTH = 5

function isMonthAllowed(year: number, month: number) {
  if (Number.isNaN(year) || Number.isNaN(month)) return false
  if (month < 1 || month > 12) return false
  if (year < MIN_YEAR) return false
  if (year === MIN_YEAR && month < MIN_MONTH) return false
  return true
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function lastDayOfMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

export default async function MemberMonthUserPage({ params }: { params: Promise<{ year: string; month: string; userId: string }> }) {
  const { year: yearStr, month: monthStr, userId } = await params
  const year = Number(yearStr)
  const month = Number(monthStr)
  if (!isMonthAllowed(year, month)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Members can only view their own page. Admins should use the /admin route.
  if (user.id !== userId) redirect('/user/monthly-tasks')

  const adminClient = createAdminClient()
  const startOfMonth = `${year}-${pad2(month)}-01`
  const endOfMonth = `${year}-${pad2(month)}-${pad2(lastDayOfMonth(year, month))}`

  const [targetRes, tasksRes, scoreRes, awardsRes] = await Promise.all([
    adminClient.from('profiles').select('id, full_name, avatar_url').eq('id', userId).single(),
    adminClient
      .from('tasks')
      .select('id, title, description, status, priority, category, task_type, complexity, start_date, due_date, completion_date, approval_status')
      .eq('user_id', userId)
      .neq('is_draft', true)
      .is('parent_task_id', null)
      .gte('due_date', startOfMonth)
      .lte('due_date', endOfMonth)
      .order('due_date', { ascending: true })
      .order('created_at', { ascending: true }),
    adminClient
      .from('monthly_scores')
      .select('total_tasks, completed_tasks, score_earned, score_possible, completion_rate, bonus_points, rank')
      .eq('user_id', userId)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle(),
    adminClient
      .from('user_awards')
      .select('id, bonus_points, note, created_at, award_types(name, icon, description)')
      .eq('user_id', userId)
      .eq('month', month)
      .eq('year', year)
      .order('created_at', { ascending: false }),
  ])

  if (!targetRes.data) notFound()

  const tasks: MonthlyTaskRow[] = (tasksRes.data ?? []) as MonthlyTaskRow[]
  const score: MonthlyScoreSummary | null = scoreRes.data
    ? {
        total_tasks: scoreRes.data.total_tasks,
        completed_tasks: scoreRes.data.completed_tasks,
        score_earned: Number(scoreRes.data.score_earned ?? 0),
        score_possible: Number(scoreRes.data.score_possible ?? 0),
        completion_rate: Number(scoreRes.data.completion_rate ?? 0),
        bonus_points: scoreRes.data.bonus_points ?? 0,
        rank: scoreRes.data.rank ?? null,
      }
    : null

  const awards: MonthAwardRow[] = (awardsRes.data ?? []).map(a => {
    const at = (a as unknown as { award_types: { name: string; icon: string; description: string | null } | null }).award_types
    return {
      id: a.id,
      bonus_points: a.bonus_points,
      note: a.note ?? null,
      created_at: a.created_at,
      name: at?.name ?? 'Award',
      icon: at?.icon ?? '🏅',
      description: at?.description ?? null,
    }
  })

  return (
    <MonthUserClient
      year={year}
      month={month}
      user={targetRes.data}
      tasks={tasks}
      score={score}
      awards={awards}
      backHref="/user/monthly-tasks"
      backLabel="Monthly Tasks"
    />
  )
}
