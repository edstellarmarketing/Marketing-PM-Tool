import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Suspense } from 'react'
import { isOverdue } from '@/lib/utils'
import { Plus, AlertCircle, CheckCircle2, Clock, TrendingUp, TrendingDown, CalendarDays, Award, Star } from 'lucide-react'
import { computeStreak } from '@/lib/scoring'
import MonthSelector from '@/components/plans/MonthSelector'
import TasksByUser from '@/components/admin/TasksByUser'
import DashboardTaskTable from '@/components/admin/DashboardTaskTable'
import DashboardClosedTaskTable from '@/components/admin/DashboardClosedTaskTable'
import UserInsightsPanel from '@/components/dashboard/UserInsightsPanel'
import UserStatCard from '@/components/dashboard/UserStatCard'
import type { Task, MonthlyScore, UserAward } from '@/types'

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface Props {
  searchParams: Promise<{ month?: string; year?: string }>
}

type TaskWithProfile = Task & {
  profiles: { full_name: string; avatar_url: string | null; designation: string | null; department: string | null } | null
}



export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear  = month === 1 ? year - 1 : year

  const [{ data: tasks }, { data: profile }, { data: scores }, { data: allScores }, { data: myAwardsRaw }, { data: prevScoreData }] = await Promise.all([
    supabase.from('tasks').select('*').eq('user_id', user!.id).order('due_date', { ascending: true }),
    supabase.from('profiles').select('full_name, role').eq('id', user!.id).single(),
    supabase.from('monthly_scores').select('*').eq('user_id', user!.id).eq('month', month).eq('year', year).single(),
    supabase.from('monthly_scores').select('*').eq('user_id', user!.id).order('year').order('month'),
    supabase.from('user_awards').select('*, award_types(id,name,icon,bonus_points)').eq('user_id', user!.id).order('created_at', { ascending: false }),
    supabase.from('monthly_scores').select('*').eq('user_id', user!.id).eq('month', prevMonth).eq('year', prevYear).single(),
  ])

  if (profile?.role === 'admin') {
    const selMonth = parseInt(params.month ?? String(month))
    const selYear  = parseInt(params.year  ?? String(year))
    const todayStr      = now.toISOString().split('T')[0]
    const startOfMonth  = new Date(selYear, selMonth - 1, 1).toISOString().split('T')[0]
    const endOfMonth    = new Date(selYear, selMonth, 0).toISOString().split('T')[0]

    const adminClient = createAdminClient()

    // Fetch tasks and profiles separately to avoid PostgREST join issues
    // Use neq('is_draft', true) so NULL rows (is_draft not set) are included
    const [{ data: rawTasks }, { data: rawProfiles }] = await Promise.all([
      adminClient
        .from('tasks')
        .select('*')
        .neq('is_draft', true)
        .order('due_date', { ascending: true, nullsFirst: false }),
      adminClient
        .from('profiles')
        .select('id, full_name, avatar_url, designation, department'),
    ])

    const profileMap: Record<string, { full_name: string; avatar_url: string | null; designation: string | null; department: string | null }> =
      Object.fromEntries((rawProfiles ?? []).map(p => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url, designation: p.designation, department: p.department ?? null }]))

    const allAdminTasks: TaskWithProfile[] = (rawTasks ?? []).map((t: Task) => ({
      ...t,
      profiles: profileMap[t.user_id] ?? null,
    }))

    const activeThisMonth = allAdminTasks.filter(t =>
      t.due_date && t.due_date >= startOfMonth && t.due_date <= endOfMonth && t.status !== 'done'
    )
    const closedThisMonth = allAdminTasks
      .filter(t => t.status === 'done' && t.due_date && t.due_date >= startOfMonth && t.due_date <= endOfMonth)
      .sort((a, b) => {
        // Sort by end date (due_date) descending — most recent end date on top
        const da = new Date(a.due_date ?? 0).getTime()
        const db = new Date(b.due_date ?? 0).getTime()
        return db - da
      })
    const dueToday  = allAdminTasks.filter(t => t.due_date === todayStr && t.status !== 'done')
    const overdueAll = allAdminTasks.filter(t => t.due_date && t.due_date < todayStr && t.status !== 'done')

    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Overview</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <CalendarDays size={20} className="text-blue-500" />
              <span className="text-2xl font-bold text-gray-900">{activeThisMonth.length}</span>
            </div>
            <p className="text-sm text-gray-600 mt-2">Active This Month</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <CheckCircle2 size={20} className="text-green-500" />
              <span className="text-2xl font-bold text-gray-900">{closedThisMonth.length}</span>
            </div>
            <p className="text-sm text-gray-600 mt-2">Closed This Month</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <Clock size={20} className="text-amber-500" />
              <span className="text-2xl font-bold text-gray-900">{dueToday.length}</span>
            </div>
            <p className="text-sm text-gray-600 mt-2">To Be Closed Today</p>
          </div>
          <div className="bg-red-50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <AlertCircle size={20} className="text-red-500" />
              <span className="text-2xl font-bold text-gray-900">{overdueAll.length}</span>
            </div>
            <p className="text-sm text-gray-600 mt-2">Overdue</p>
          </div>
        </div>

        {/* Tasks by user */}
        <TasksByUser tasks={allAdminTasks} />

        {/* Active this month */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">
              Active Tasks This Month
              <span className="ml-2 text-sm font-normal text-gray-400">({activeThisMonth.length})</span>
            </h2>
            <Suspense>
              <MonthSelector month={selMonth} year={selYear} />
            </Suspense>
          </div>
          <DashboardTaskTable tasks={activeThisMonth} emptyMessage="No active tasks for this month" showProgress />
        </div>

        {/* Due today */}
        <div className="bg-white border border-amber-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock size={16} className="text-amber-500" />
            To Be Closed Today
            <span className="text-sm font-normal text-gray-400">({dueToday.length})</span>
          </h2>
          <DashboardTaskTable tasks={dueToday} emptyMessage="No tasks due today" />
        </div>

        {/* Overdue */}
        <div className="bg-white border border-red-200 rounded-xl p-5">
          <h2 className="font-semibold text-red-800 mb-4 flex items-center gap-2">
            <AlertCircle size={16} />
            Overdue Tasks
            <span className="text-sm font-normal text-red-400">({overdueAll.length})</span>
          </h2>
          <DashboardTaskTable tasks={overdueAll} emptyMessage="No overdue tasks" />
        </div>

        {/* Closed this month */}
        <div className="bg-white border border-green-200 rounded-xl p-5">
          <h2 className="font-semibold text-green-800 mb-4 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600" />
            Closed This Month
            <span className="text-sm font-normal text-green-500">({closedThisMonth.length})</span>
          </h2>
          <DashboardClosedTaskTable tasks={closedThisMonth} emptyMessage="No tasks closed this month yet" />
        </div>
      </div>
    )
  }

  // ── Member dashboard ─────────────────────────────────────────────────────────

  const allTasks  = (tasks ?? []) as Task[]
  const myScores  = (allScores ?? []) as MonthlyScore[]
  const myAwards  = (myAwardsRaw ?? []) as UserAward[]
  const prevScore = prevScoreData as MonthlyScore | null
  const todayStr  = now.toISOString().split('T')[0]

  const thisMonthTasks = allTasks.filter(t => {
    const d = t.due_date ? new Date(t.due_date) : new Date(t.created_at)
    return d.getMonth() + 1 === month && d.getFullYear() === year && !t.is_draft
  })

  const activeThisMonth  = thisMonthTasks.filter(t => t.status !== 'done')
  const closedThisMonthAll = thisMonthTasks.filter(t => t.status === 'done')
  const todayTasks       = allTasks.filter(t => t.due_date === todayStr && t.status !== 'done')
  const overdueTasks     = allTasks.filter(t => isOverdue(t.due_date, t.status))

  const typeCount = { monthly_task: 0, new_implementation: 0, ai: 0 } as Record<string, number>
  for (const t of thisMonthTasks) if (t.task_type) typeCount[t.task_type] = (typeCount[t.task_type] ?? 0) + 1

  const closedWithDates = closedThisMonthAll.filter(t => t.due_date && t.completion_date)
  const earlyCount  = closedWithDates.filter(t => new Date(t.completion_date!) < new Date(t.due_date!)).length
  const lateCount   = closedWithDates.filter(t => new Date(t.completion_date!) > new Date(t.due_date!)).length
  const onTimeCount = closedWithDates.length - earlyCount - lateCount

  const streak      = computeStreak(myScores)
  const scoreDelta  = scores && prevScore ? scores.score_earned - prevScore.score_earned : null
  const rateDelta   = scores && prevScore ? Number(scores.completion_rate) - Number(prevScore.completion_rate) : null

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {profile?.full_name?.split(' ')[0] ?? 'there'} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Link href="/tasks/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <Plus size={16} /> New Task
        </Link>
      </div>

      {/* Stat cards — each expands to show associated tasks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <UserStatCard
          label="Active This Month"
          value={activeThisMonth.length}
          icon={<CalendarDays size={20} className="text-blue-500" />}
          bg="bg-blue-50"
          divider="border-blue-100"
          tasks={activeThisMonth.map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, due_date: t.due_date, score_weight: t.score_weight, score_earned: t.score_earned }))}
          emptyMessage="No active tasks this month"
        />
        <UserStatCard
          label="Closed This Month"
          value={closedThisMonthAll.length}
          icon={<CheckCircle2 size={20} className="text-green-500" />}
          bg="bg-green-50"
          divider="border-green-100"
          tasks={closedThisMonthAll.map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, due_date: t.due_date, score_weight: t.score_weight, score_earned: t.score_earned }))}
          emptyMessage="No tasks closed this month yet"
        />
        <UserStatCard
          label="Due Today"
          value={todayTasks.length}
          icon={<Clock size={20} className="text-amber-500" />}
          bg="bg-amber-50"
          divider="border-amber-100"
          tasks={todayTasks.map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, due_date: t.due_date, score_weight: t.score_weight, score_earned: t.score_earned }))}
          emptyMessage="No tasks due today 🎉"
        />
        <UserStatCard
          label="Overdue"
          value={overdueTasks.length}
          icon={<AlertCircle size={20} className="text-red-500" />}
          bg="bg-red-50"
          divider="border-red-100"
          tasks={overdueTasks.map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, due_date: t.due_date, score_weight: t.score_weight, score_earned: t.score_earned }))}
          emptyMessage="No overdue tasks"
        />
      </div>

      {/* Score / Rank / Streak cards */}
      {scores && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Score card with delta */}
          <div className="md:col-span-1 bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Score This Month</p>
              {scoreDelta !== null && (
                <span className={`flex items-center gap-0.5 text-xs font-semibold ${scoreDelta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {scoreDelta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {scoreDelta >= 0 ? '+' : ''}{scoreDelta} vs last month
                </span>
              )}
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-1">{scores.score_earned + (scores.bonus_points ?? 0)}<span className="text-sm font-normal text-gray-400 ml-1">pts</span></p>
            {(scores.bonus_points ?? 0) > 0 && (
              <p className="text-xs text-amber-600 mt-0.5">{scores.score_earned} task + {scores.bonus_points} 🏅 bonus</p>
            )}
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>{scores.score_earned} earned</span>
                <span>{scores.score_possible} possible</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, scores.score_possible > 0 ? (scores.score_earned / scores.score_possible) * 100 : 0)}%` }} />
              </div>
            </div>
          </div>

          {/* Rank card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col items-center justify-center gap-1">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Team Rank</p>
            {scores.rank ? (
              <>
                <p className="text-4xl font-bold text-gray-900 mt-1">#{scores.rank}</p>
                {streak > 0 && <p className="text-xs text-orange-500 font-medium mt-0.5">🔥 {streak}-month streak</p>}
                <Link href="/leaderboard" className="text-xs text-blue-500 hover:underline mt-1">View leaderboard →</Link>
              </>
            ) : (
              <p className="text-sm text-gray-400 text-center mt-1">Not ranked yet</p>
            )}
          </div>

          {/* Completion rate card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col justify-center gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Completion Rate</p>
              {rateDelta !== null && (
                <span className={`text-xs font-semibold ${rateDelta >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {rateDelta >= 0 ? '+' : ''}{rateDelta.toFixed(0)}%
                </span>
              )}
            </div>
            <p className="text-3xl font-bold text-gray-900">{Number(scores.completion_rate).toFixed(0)}<span className="text-sm font-normal text-gray-400 ml-0.5">%</span></p>
            <p className="text-xs text-gray-400">{scores.completed_tasks ?? 0} of {scores.total_tasks ?? 0} tasks done</p>
            {prevScore && (
              <p className="text-xs text-gray-400">Last month: {Number(prevScore.completion_rate).toFixed(0)}%</p>
            )}
          </div>
        </div>
      )}

      {/* Awards Won */}
      {myAwards.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Award size={16} className="text-amber-500" />
              <h2 className="font-semibold text-gray-900">Awards Won</h2>
              <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">{myAwards.length}</span>
            </div>
            <Link href="/leaderboard#all-awards" className="text-xs text-blue-500 hover:underline">See all →</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {myAwards.slice(0, 5).map(award => {
              const at = award.award_types
              return (
                <div key={award.id} className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex flex-col items-center text-center gap-1">
                  <span className="text-2xl">{at?.icon ?? '🏅'}</span>
                  <p className="text-xs font-semibold text-gray-800 leading-tight">{at?.name ?? 'Award'}</p>
                  <p className="text-[11px] text-gray-400">{MONTHS_SHORT[award.month - 1]} {award.year}</p>
                  <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full mt-0.5">+{award.bonus_points} pts</span>
                </div>
              )
            })}
            {myAwards.length > 5 && (
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col items-center justify-center text-center gap-1">
                <Star size={18} className="text-gray-300" />
                <p className="text-xs font-medium text-gray-400">+{myAwards.length - 5} more</p>
                <Link href="/leaderboard#all-awards" className="text-[11px] text-blue-500 hover:underline">View all</Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Task breakdown */}
      {thisMonthTasks.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-4">This Month — Task Breakdown</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">By Type</p>
              <div className="space-y-2">
                {[
                  { key: 'monthly_task',       label: '🔁 Monthly Task',       color: 'bg-blue-500' },
                  { key: 'new_implementation', label: '🚀 New Implementation', color: 'bg-purple-500' },
                  { key: 'ai',                 label: '🤖 AI',                 color: 'bg-pink-500' },
                ].map(({ key, label, color }) => {
                  const count = typeCount[key] ?? 0
                  const pct   = thisMonthTasks.length > 0 ? (count / thisMonthTasks.length) * 100 : 0
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600">{label}</span>
                        <span className="text-gray-400 font-medium">{count}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Deadline Performance</p>
              {closedWithDates.length === 0 ? (
                <p className="text-sm text-gray-400">No closed tasks yet this month</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-green-700 font-medium">✦ Early</span>
                    <span className="text-sm font-bold text-green-700">{earlyCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-blue-600 font-medium">● On Time</span>
                    <span className="text-sm font-bold text-blue-600">{onTimeCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-red-500 font-medium">⚠ Late</span>
                    <span className="text-sm font-bold text-red-500">{lateCount}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex mt-2">
                    {earlyCount  > 0 && <div className="bg-green-500 h-full" style={{ width: `${(earlyCount  / closedWithDates.length) * 100}%` }} />}
                    {onTimeCount > 0 && <div className="bg-blue-400  h-full" style={{ width: `${(onTimeCount / closedWithDates.length) * 100}%` }} />}
                    {lateCount   > 0 && <div className="bg-red-400   h-full" style={{ width: `${(lateCount   / closedWithDates.length) * 100}%` }} />}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Insights */}
      <UserInsightsPanel />

    </div>
  )
}
