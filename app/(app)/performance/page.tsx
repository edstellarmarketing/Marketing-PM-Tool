import Link from 'next/link'
import { Suspense, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Award,
  BarChart3,
  CheckCircle2,
  CircleDot,
  Clock3,
  Flame,
  ListChecks,
  Medal,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cn, formatDate, getCurrentFinancialYear, isOverdue } from '@/lib/utils'
import FinancialYearSelector from '@/components/performance/FinancialYearSelector'
import PerformanceTrendChart, { type PerformanceTrendPoint } from '@/components/performance/PerformanceTrendChart'
import type { MonthlyScore, PerformanceSummary, Task, UserAward } from '@/types'

const MONTHS_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export const dynamic = 'force-dynamic'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FY_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]

interface Props {
  searchParams: Promise<{ fy?: string }>
}

interface RatingBand {
  label: string
  className: string
}

function ratingBand(avg: number): RatingBand {
  if (avg >= 90) return { label: 'Exceptional', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
  if (avg >= 75) return { label: 'Exceeds Expectations', className: 'bg-blue-100 text-blue-700 border-blue-200' }
  if (avg >= 60) return { label: 'Meets Expectations', className: 'bg-amber-100 text-amber-700 border-amber-200' }
  if (avg >= 45) return { label: 'Needs Improvement', className: 'bg-orange-100 text-orange-700 border-orange-200' }
  return { label: 'Underperforming', className: 'bg-red-100 text-red-700 border-red-200' }
}

function parseFy(financialYear: string) {
  const [start] = financialYear.split('-')
  const startYear = Number(start)
  return { startYear, endYear: startYear + 1 }
}

function inFinancialYear(month: number, year: number, financialYear: string) {
  const { startYear, endYear } = parseFy(financialYear)
  return (year === startYear && month >= 4) || (year === endYear && month <= 3)
}

function taskDate(task: Task) {
  return task.due_date ?? task.created_at
}

function taskInFinancialYear(task: Task, financialYear: string) {
  const date = new Date(taskDate(task))
  return inFinancialYear(date.getMonth() + 1, date.getFullYear(), financialYear)
}

function fyOptions(currentFy: string, summaries: PerformanceSummary[], scores: MonthlyScore[]) {
  const currentStart = parseFy(currentFy).startYear
  const years = new Set<string>()

  for (let offset = 0; offset < 4; offset++) {
    const year = currentStart - offset
    years.add(`${year}-${String(year + 1).slice(2)}`)
  }

  summaries.forEach(summary => years.add(summary.financial_year))
  scores.forEach(score => {
    const startYear = score.month >= 4 ? score.year : score.year - 1
    years.add(`${startYear}-${String(startYear + 1).slice(2)}`)
  })

  return [...years].sort((a, b) => parseFy(b).startYear - parseFy(a).startYear)
}

function formatMonthYear(month: number, year: number) {
  return `${MONTHS[month - 1]} ${String(year).slice(2)}`
}

function buildTrend(scores: MonthlyScore[], financialYear: string): PerformanceTrendPoint[] {
  const { startYear, endYear } = parseFy(financialYear)

  return FY_MONTHS.map(month => {
    const year = month >= 4 ? startYear : endYear
    const score = scores.find(item => item.month === month && item.year === year)

    return {
      label: MONTHS[month - 1],
      score: score?.score_earned ?? 0,
      possible: score?.score_possible ?? 0,
      completion: Number(score?.completion_rate ?? 0),
      completedTasks: score?.completed_tasks ?? 0,
      totalTasks: score?.total_tasks ?? 0,
      rank: score?.rank ?? null,
      hasData: Boolean(score),
    }
  })
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function improvementFocus(completionRate: number, overdueCount: number, trendScores: number[]) {
  const lastThree = trendScores.filter(score => score > 0).slice(-3)
  const falling = lastThree.length >= 3 && lastThree[2] < lastThree[1] && lastThree[1] < lastThree[0]

  if (completionRate < 60) {
    return {
      title: 'Close committed work more consistently',
      body: 'Completion is below the target range for this financial year. Prioritize fewer active tasks and move approved work to done before adding new commitments.',
      icon: <Target size={18} />,
      className: 'bg-orange-50 border-orange-200 text-orange-800',
    }
  }

  if (overdueCount > 0) {
    return {
      title: 'Improve due-date discipline',
      body: `${overdueCount} task${overdueCount === 1 ? '' : 's'} need attention. Clearing delayed work will protect score momentum and make the next month easier to plan.`,
      icon: <Clock3 size={18} />,
      className: 'bg-red-50 border-red-200 text-red-800',
    }
  }

  if (falling) {
    return {
      title: 'Recover score momentum',
      body: 'Recent monthly scores are trending down. Inspect the last two months and identify the task categories where points were left incomplete.',
      icon: <TrendingDown size={18} />,
      className: 'bg-amber-50 border-amber-200 text-amber-800',
    }
  }

  return {
    title: 'Maintain consistent execution',
    body: 'Your current pattern is stable. Keep task scope realistic, finish high-value work first, and preserve the habits driving your score.',
    icon: <Flame size={18} />,
    className: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  }
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  className,
}: {
  label: string
  value: string | number
  detail: string
  icon: ReactNode
  className: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-gray-950">{value}</p>
        </div>
        <div className={cn('rounded-lg p-2', className)}>{icon}</div>
      </div>
      <p className="mt-3 min-h-8 text-sm leading-4 text-gray-500">{detail}</p>
    </div>
  )
}

export default async function MyPerformancePage({ searchParams }: Props) {
  const params = await searchParams
  const currentFy = getCurrentFinancialYear()
  const selectedFy = params.fy && /^\d{4}-\d{2}$/.test(params.fy) ? params.fy : currentFy

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  if (profile?.role === 'admin') redirect('/dashboard')

  const [scoresRes, tasksRes, summariesRes, awardsRes] = await Promise.all([
    supabase.from('monthly_scores').select('*').eq('user_id', user!.id).order('year').order('month'),
    supabase.from('tasks').select('*').eq('user_id', user!.id).order('due_date', { ascending: true }),
    supabase.from('performance_summaries').select('*').eq('user_id', user!.id).order('financial_year', { ascending: false }),
    supabase.from('user_awards').select('*, award_types(id,name,icon,bonus_points)').eq('user_id', user!.id).order('year').order('month'),
  ])

  const allScores = (scoresRes.data ?? []) as MonthlyScore[]
  const allTasks = (tasksRes.data ?? []) as Task[]
  const summaries = summariesRes.error ? [] : (summariesRes.data ?? []) as PerformanceSummary[]
  const allAwards = (awardsRes.data ?? []) as UserAward[]

  const options = fyOptions(currentFy, summaries, allScores)
  const selectedScores = allScores.filter(score => inFinancialYear(score.month, score.year, selectedFy))
  const selectedTasks = allTasks.filter(task => taskInFinancialYear(task, selectedFy))
  const selectedSummary = summaries.find(summary => summary.financial_year === selectedFy) ?? null

  const fyAwards = allAwards.filter(a => {
    const { startYear, endYear } = parseFy(selectedFy)
    return (a.year === startYear && a.month >= 4) || (a.year === endYear && a.month <= 3)
  })
  const fyBonusTotal = fyAwards.reduce((sum, a) => sum + a.bonus_points, 0)

  const totalScore = selectedScores.reduce((sum, score) => sum + score.score_earned, 0)
  const possibleScore = selectedScores.reduce((sum, score) => sum + score.score_possible, 0)
  const completedTasks = selectedScores.reduce((sum, score) => sum + score.completed_tasks, 0)
  const totalTasks = selectedScores.reduce((sum, score) => sum + score.total_tasks, 0)
  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : average(selectedScores.map(score => Number(score.completion_rate)))
  const avgMonthly = average(selectedScores.map(score => score.score_earned))
  const bestScore = selectedScores.reduce<MonthlyScore | null>((best, score) => !best || score.score_earned > best.score_earned ? score : best, null)
  const coverage = selectedScores.filter(score => score.total_tasks > 0 || score.score_possible > 0 || score.score_earned > 0).length
  const lastScore = [...selectedScores].sort((a, b) => a.year !== b.year ? b.year - a.year : b.month - a.month)[0]
  const rating = ratingBand(avgMonthly)
  const trend = buildTrend(selectedScores, selectedFy)
  const overdueTasks = selectedTasks.filter(task => isOverdue(task.due_date, task.status))
  const blockedTasks = selectedTasks.filter(task => task.status === 'blocked')
  const inProgressTasks = selectedTasks.filter(task => task.status === 'in_progress')
  const doneTasks = selectedTasks.filter(task => task.status === 'done')
  const topTasks = [...doneTasks].sort((a, b) => b.score_earned - a.score_earned).slice(0, 5)
  const focus = improvementFocus(completionRate, overdueTasks.length, trend.map(point => point.score))

  const categoryCounts = selectedTasks.reduce<Record<string, { total: number; done: number; score: number }>>((acc, task) => {
    const key = task.category || 'Uncategorized'
    acc[key] ??= { total: 0, done: 0, score: 0 }
    acc[key].total += 1
    if (task.status === 'done') acc[key].done += 1
    acc[key].score += task.score_earned
    return acc
  }, {})
  const categories = Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b.score - a.score)
    .slice(0, 4)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-600">Performance command center</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-gray-950">My Performance</h1>
          <p className="mt-1 text-sm font-medium text-gray-500">Track your monthly scores, work evidence, and growth areas.</p>
        </div>
        <Suspense>
          <FinancialYearSelector currentFy={selectedFy} options={options} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Score"
          value={fyBonusTotal > 0 ? totalScore + fyBonusTotal : totalScore}
          detail={fyBonusTotal > 0 ? `${totalScore} task + ${fyBonusTotal} award pts` : possibleScore > 0 ? `${possibleScore} pts possible` : `FY ${selectedFy}`}
          icon={<BarChart3 size={20} className="text-blue-600" />}
          className="bg-blue-50"
        />
        <MetricCard
          label="Average Monthly"
          value={avgMonthly.toFixed(1)}
          detail={`${coverage} of 12 months with score activity`}
          icon={<TrendingUp size={20} className="text-violet-600" />}
          className="bg-violet-50"
        />
        <MetricCard
          label="Completion Rate"
          value={`${completionRate.toFixed(0)}%`}
          detail={`${completedTasks} of ${totalTasks} tasks completed`}
          icon={<CheckCircle2 size={20} className="text-emerald-600" />}
          className="bg-emerald-50"
        />
        <MetricCard
          label="Best Month"
          value={bestScore ? MONTHS[bestScore.month - 1] : '-'}
          detail={bestScore ? `${bestScore.score_earned} pts in ${bestScore.year}` : 'No score activity yet'}
          icon={<Medal size={20} className="text-amber-600" />}
          className="bg-amber-50"
        />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-gray-950 p-2.5 text-white">
              <CircleDot size={20} />
            </div>
            <div>
              <h2 className="font-bold text-gray-950">FY {selectedFy} status</h2>
              <p className="mt-1 text-sm text-gray-500">
                {coverage > 0
                  ? `Data coverage: ${coverage} of 12 months. Last score update: ${lastScore ? formatMonthYear(lastScore.month, lastScore.year) : 'not available'}.`
                  : 'More monthly data will appear here as tasks are completed.'}
              </p>
            </div>
          </div>
          <span className={cn('inline-flex w-fit items-center rounded-full border px-3 py-1 text-sm font-bold', rating.className)}>
            {rating.label}
          </span>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-gray-950">Monthly Performance Trend</h2>
            <p className="text-sm text-gray-500">Score bars with completion percentage overlay.</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium text-gray-400">
            <span className="flex items-center gap-1.5"><span className="h-2 w-5 rounded bg-blue-500" /> Score</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-violet-500" /> Completion</span>
          </div>
        </div>
        <PerformanceTrendChart data={trend} />
      </section>

      {fyAwards.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Award size={18} className="text-amber-500" />
              <h2 className="font-bold text-gray-950">Awards & Recognition</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">FY {selectedFy}</span>
            </div>
            <span className="text-sm font-bold text-amber-700">+{fyBonusTotal} bonus pts</span>
          </div>
          <div className="space-y-3">
            {fyAwards.map(award => {
              const at = award.award_types
              return (
                <div key={award.id} className="flex items-start gap-3 rounded-xl border border-gray-100 p-3">
                  <span className="text-2xl flex-shrink-0">{at?.icon ?? '🏅'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-gray-900">{at?.name ?? 'Award'}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">+{award.bonus_points} pts</span>
                      <span className="text-xs text-gray-400">{MONTHS_ABBR[award.month - 1]} {award.year}</span>
                    </div>
                    {award.note && <p className="text-xs text-gray-600 mt-1 italic">"{award.note}"</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <ListChecks size={18} className="text-blue-600" />
            <h2 className="font-bold text-gray-950">Task Evidence</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-50 p-3">
              <p className="text-2xl font-bold text-emerald-700">{doneTasks.length}</p>
              <p className="text-xs font-medium text-emerald-700">Completed</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3">
              <p className="text-2xl font-bold text-blue-700">{inProgressTasks.length}</p>
              <p className="text-xs font-medium text-blue-700">In progress</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3">
              <p className="text-2xl font-bold text-red-700">{overdueTasks.length}</p>
              <p className="text-xs font-medium text-red-700">Overdue</p>
            </div>
            <div className="rounded-xl bg-gray-100 p-3">
              <p className="text-2xl font-bold text-gray-800">{blockedTasks.length}</p>
              <p className="text-xs font-medium text-gray-600">Blocked</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-800">Category contribution</h3>
            {categories.length > 0 ? categories.map(([category, stats]) => (
              <div key={category}>
                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-semibold text-gray-700">{category}</span>
                  <span className="text-gray-400">{stats.score} pts</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${Math.min(100, totalScore > 0 ? (stats.score / totalScore) * 100 : 0)}%` }}
                  />
                </div>
              </div>
            )) : (
              <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-sm font-medium text-gray-400">
                No task evidence for this financial year
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-3">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ArrowUpRight size={18} className="text-blue-600" />
              <h2 className="font-bold text-gray-950">Top Scoring Work</h2>
            </div>
            <Link href="/tasks" className="text-sm font-semibold text-blue-600 hover:underline">View tasks</Link>
          </div>
          {topTasks.length > 0 ? (
            <div className="space-y-3">
              {topTasks.map(task => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 p-3 transition hover:border-blue-200 hover:bg-blue-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-900">{task.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-gray-500">{task.category || 'Uncategorized'}</span>
                      {task.task_type && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                          {task.task_type === 'monthly_task' ? '🔁' : task.task_type === 'new_implementation' ? '🚀' : '🤖'}{' '}
                          {task.task_type === 'monthly_task' ? 'Monthly' : task.task_type === 'new_implementation' ? 'New Impl.' : 'AI'}
                        </span>
                      )}
                      {task.complexity && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 capitalize">
                          {task.complexity}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{formatDate(task.completion_date ?? task.due_date)}</span>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700">
                    {Math.round(task.score_earned * 100) / 100} pts
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center">
              <p className="font-semibold text-gray-500">No completed scored work yet</p>
              <p className="mt-1 text-sm text-gray-400">Completed tasks with earned points will appear here.</p>
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-gray-950">Performance Insights</h2>
          {selectedSummary?.summary ? (
            <p className="mt-3 border-l-4 border-blue-500 pl-4 text-sm leading-6 text-gray-700">{selectedSummary.summary}</p>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm font-medium text-gray-400">
              No performance summary yet. Your monthly scores and task progress will appear here as data becomes available.
            </p>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-800">
                <CheckCircle2 size={16} className="text-emerald-600" /> Strengths
              </h3>
              {selectedSummary?.strengths?.length ? (
                <ul className="space-y-2">
                  {selectedSummary.strengths.map((strength, index) => (
                    <li key={index} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{strength}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">Strength signals will appear after enough data is available.</p>
              )}
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-800">
                <AlertTriangle size={16} className="text-orange-500" /> Growth Areas
              </h3>
              {selectedSummary?.growth_areas?.length ? (
                <ul className="space-y-2">
                  {selectedSummary.growth_areas.map((area, index) => (
                    <li key={index} className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">{area}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">Growth signals will appear after enough data is available.</p>
              )}
            </div>
          </div>
        </div>

        <div className={cn('rounded-2xl border p-5 shadow-sm', focus.className)}>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white/70 p-2">{focus.icon}</div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide opacity-80">Recommended focus</p>
              <h2 className="mt-1 text-xl font-black">{focus.title}</h2>
              <p className="mt-3 text-sm leading-6">{focus.body}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-gray-950">Performance History</h2>
        {options.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="pb-3 pr-4">Financial Year</th>
                  <th className="pb-3 pr-4">Total Score</th>
                  <th className="pb-3 pr-4">Average Monthly</th>
                  <th className="pb-3 pr-4">Rating</th>
                  <th className="pb-3 pr-4">Coverage</th>
                  <th className="pb-3">Best Month</th>
                </tr>
              </thead>
              <tbody>
                {options.map(option => {
                  const optionScores = allScores.filter(score => inFinancialYear(score.month, score.year, option))
                  const optionTotal = optionScores.reduce((sum, score) => sum + score.score_earned, 0)
                  const optionAvg = average(optionScores.map(score => score.score_earned))
                  const optionRating = ratingBand(optionAvg)
                  const optionCoverage = optionScores.filter(score => score.total_tasks > 0 || score.score_possible > 0 || score.score_earned > 0).length
                  const optionBest = optionScores.reduce<MonthlyScore | null>((best, score) => !best || score.score_earned > best.score_earned ? score : best, null)
                  const rowActive = option === selectedFy

                  return (
                    <tr key={option} className={cn('border-b border-gray-50 last:border-0', rowActive && 'bg-blue-50/70')}>
                      <td className="py-3 pr-4 font-bold text-gray-950">
                        <Link href={`/performance?fy=${option}`} className="hover:text-blue-600">FY {option}</Link>
                      </td>
                      <td className="py-3 pr-4 text-gray-700">{optionTotal}</td>
                      <td className="py-3 pr-4 text-gray-700">{optionAvg.toFixed(1)}</td>
                      <td className="py-3 pr-4">
                        <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-bold', optionRating.className)}>
                          {optionRating.label}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-gray-500">{optionCoverage}/12</td>
                      <td className="py-3 text-gray-500">{optionBest ? `${MONTHS[optionBest.month - 1]} ${optionBest.score_earned} pts` : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm font-medium text-gray-400">
            No performance data yet
          </p>
        )}
      </section>
    </div>
  )
}
