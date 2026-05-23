'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Trophy, Target, Award as AwardIcon, Sparkles } from 'lucide-react'

interface UserInfo {
  id: string
  full_name: string
  avatar_url?: string | null
}

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done' | 'blocked'

export interface MonthlyTaskRow {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: 'low' | 'medium' | 'high' | 'critical'
  category: string | null
  task_type: string | null
  complexity: string | null
  start_date: string | null
  due_date: string | null
  completion_date: string | null
  approval_status: string | null
}

export interface MonthlyScoreSummary {
  total_tasks: number
  completed_tasks: number
  score_earned: number
  score_possible: number
  completion_rate: number
  bonus_points: number
  rank: number | null
}

export interface MonthAwardRow {
  id: string
  bonus_points: number
  note: string | null
  created_at: string
  name: string
  icon: string
  description: string | null
}

interface Props {
  year: number
  month: number
  user: UserInfo
  tasks: MonthlyTaskRow[]
  score: MonthlyScoreSummary | null
  awards: MonthAwardRow[]
  /** Override the back-link href (defaults to admin month list). */
  backHref?: string
  /** Override the back-link label (defaults to "<Month> <Year>"). */
  backLabel?: string
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
  blocked: 'Blocked',
}

const STATUS_CLS: Record<TaskStatus, string> = {
  todo: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  review: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  done: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  blocked: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function Avatar({ user }: { user: UserInfo }) {
  if (user.avatar_url) {
    return <img src={user.avatar_url} alt={user.full_name} className="w-10 h-10 rounded-full object-cover" />
  }
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-bold flex items-center justify-center">
      {initials(user.full_name)}
    </div>
  )
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export default function MonthUserClient({ year, month, user, tasks: initialTasks, score, awards, backHref, backLabel }: Props) {
  const monthHref = backHref ?? `/admin/monthly-tasks/${year}/${String(month).padStart(2, '0')}`
  const linkLabel = backLabel ?? `${MONTHS[month - 1]} ${year}`
  const [tasks, setTasks] = useState<MonthlyTaskRow[]>(initialTasks)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pendingTasks = useMemo(() => tasks.filter(t => t.status !== 'done'), [tasks])
  const doneTasks = useMemo(() => tasks.filter(t => t.status === 'done'), [tasks])

  const awardsBonus = useMemo(() => awards.reduce((sum, a) => sum + (a.bonus_points ?? 0), 0), [awards])
  const taskPoints = Math.round(score?.score_earned ?? 0)
  const bonusPoints = score?.bonus_points ?? awardsBonus
  const totalPoints = taskPoints + bonusPoints
  const possible = Math.round(score?.score_possible ?? 0)
  const completionPct = score?.completion_rate ?? (tasks.length === 0 ? 0 : Math.round((doneTasks.length / tasks.length) * 100))

  async function handleStatusChange(taskId: string, newStatus: TaskStatus) {
    const task = tasks.find(t => t.id === taskId)
    if (!task || task.status === newStatus) return

    const previousStatus = task.status
    setUpdatingId(taskId)
    setError(null)

    // Optimistic update
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, status: newStatus } : t)))

    try {
      const res = await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to update status' }))
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to update status')
      }
      const updated = await res.json()
      setTasks(prev => prev.map(t => (t.id === taskId
        ? {
            ...t,
            status: updated.status as TaskStatus,
            approval_status: updated.approval_status ?? t.approval_status,
            completion_date: updated.completion_date ?? null,
          }
        : t)))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update status'
      setError(message)
      // Revert
      setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, status: previousStatus } : t)))
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      <div className="flex-shrink-0">
        <Link
          href={monthHref}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 mb-3"
        >
          <ArrowLeft size={14} />
          {linkLabel}
        </Link>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar user={user} />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">{user.full_name}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Monthly plan — {MONTHS[month - 1]} {year} ·
                {' '}{doneTasks.length} of {tasks.length} done
              </p>
            </div>
          </div>
        </div>
        {error && (
          <div className="mb-3 px-3 py-2 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <StatCard
            label="Total Points"
            value={totalPoints}
            sub={possible > 0 ? `of ${possible} possible` : 'this month'}
            tone="blue"
            icon={<Trophy size={16} />}
          />
          <StatCard
            label="Task Points"
            value={taskPoints}
            sub={`${doneTasks.length} of ${tasks.length} done`}
            tone="emerald"
            icon={<Target size={16} />}
          />
          <StatCard
            label="Bonus Points"
            value={bonusPoints}
            sub={awards.length > 0 ? `${awards.length} award${awards.length === 1 ? '' : 's'}` : 'No awards yet'}
            tone="amber"
            icon={<Sparkles size={16} />}
          />
          <StatCard
            label="Completion"
            value={`${Math.round(completionPct)}%`}
            sub={score?.rank ? `Rank #${score.rank}` : 'Not ranked yet'}
            tone="purple"
            icon={<AwardIcon size={16} />}
          />
        </div>

        {awards.length > 0 && (
          <div className="mb-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                <Trophy size={14} className="text-amber-500" />
                Awards earned this month
              </h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                +{awardsBonus} bonus points
              </span>
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {awards.map(a => (
                <li
                  key={a.id}
                  className="flex items-start gap-2.5 px-3 py-2 rounded-lg border border-amber-100 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20"
                >
                  <span className="text-xl leading-none mt-0.5" aria-hidden>{a.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{a.name}</p>
                      <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap">
                        +{a.bonus_points}
                      </span>
                    </div>
                    {a.note && (
                      <p className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">{a.note}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        <TaskPanel
          title="Pending"
          subtitle="Not done yet"
          tone="red"
          tasks={pendingTasks}
          updatingId={updatingId}
          onStatusChange={handleStatusChange}
        />
        <TaskPanel
          title="Completed"
          subtitle="Marked as done"
          tone="green"
          tasks={doneTasks}
          updatingId={updatingId}
          onStatusChange={handleStatusChange}
        />
      </div>
    </div>
  )
}

function TaskPanel({
  title, subtitle, tone, tasks, updatingId, onStatusChange,
}: {
  title: string
  subtitle: string
  tone: 'red' | 'green'
  tasks: MonthlyTaskRow[]
  updatingId: string | null
  onStatusChange: (taskId: string, status: TaskStatus) => void
}) {
  const headerCls = tone === 'red'
    ? 'bg-red-50/60 dark:bg-red-950/30 text-red-700 dark:text-red-300'
    : 'bg-green-50/60 dark:bg-green-950/30 text-green-700 dark:text-green-300'

  const rowBg = tone === 'red'
    ? 'bg-red-50/70 dark:bg-red-950/20 hover:bg-red-100/60 dark:hover:bg-red-950/30'
    : 'bg-green-50/70 dark:bg-green-950/20 hover:bg-green-100/60 dark:hover:bg-green-950/30'

  return (
    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl flex flex-col overflow-hidden">
      <header className={`flex items-center justify-between gap-2 px-5 py-3 border-b border-gray-100 dark:border-gray-800 ${headerCls}`}>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wide truncate">{title}</h2>
          <p className="text-[11px] opacity-80">{subtitle}</p>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/70 dark:bg-gray-900/40 text-gray-700 dark:text-gray-200">
          {tasks.length}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {tasks.length === 0 ? (
          <div className="w-full h-full min-h-[160px] border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg flex flex-col items-center justify-center gap-1.5 text-gray-400">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No tasks</p>
            <p className="text-xs">{tone === 'red' ? 'Nothing pending right now' : 'No tasks marked done yet'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-gray-50 dark:bg-gray-800/40">
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b-2 border-gray-300 dark:border-gray-700">
                  <th className="px-2 py-1.5 font-medium">Task</th>
                  <th className="px-2 py-1.5 font-medium">Type</th>
                  <th className="px-2 py-1.5 font-medium">Complexity</th>
                  <th className="px-2 py-1.5 font-medium">Priority</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 font-medium whitespace-nowrap">Due</th>
                  <th className="px-2 py-1.5 font-medium w-8"></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(t => {
                  const isUpdating = updatingId === t.id
                  return (
                    <tr key={t.id} className={`border-t border-gray-300 dark:border-gray-700 align-top ${rowBg}`}>
                      <td className="px-2 py-1.5 text-gray-900 dark:text-white">
                        <Link
                          href={`/tasks/${t.id}`}
                          className="font-medium hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                        >
                          {t.title}
                        </Link>
                        {t.description && (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{t.description}</p>
                        )}
                        {t.approval_status === 'pending_approval' && (
                          <p className="text-[10px] mt-0.5 text-amber-700 dark:text-amber-400">⏳ Pending approval</p>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 capitalize whitespace-nowrap">{t.task_type ? t.task_type.replace(/_/g, ' ') : '—'}</td>
                      <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 capitalize">{t.complexity ?? '—'}</td>
                      <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 capitalize">{t.priority}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <select
                          value={t.status}
                          disabled={isUpdating}
                          onChange={e => onStatusChange(t.id, e.target.value as TaskStatus)}
                          className={`appearance-none cursor-pointer border-0 rounded px-1.5 py-0.5 text-[10px] font-medium focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-60 disabled:cursor-wait ${STATUS_CLS[t.status]}`}
                        >
                          {(Object.entries(STATUS_LABELS) as [TaskStatus, string][]).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{formatDate(t.due_date)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <Link
                          href={`/tasks/${t.id}`}
                          className="p-1 inline-flex text-gray-400 hover:text-blue-600"
                          title="Open task"
                        >
                          <ExternalLink size={12} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function StatCard({
  label, value, sub, tone, icon,
}: {
  label: string
  value: number | string
  sub: string
  tone: 'blue' | 'emerald' | 'amber' | 'purple'
  icon: React.ReactNode
}) {
  const toneCls: Record<typeof tone, string> = {
    blue: 'bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/40 text-blue-700 dark:text-blue-300',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300',
    amber: 'bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/40 text-amber-700 dark:text-amber-300',
    purple: 'bg-purple-50 dark:bg-purple-950/30 border-purple-100 dark:border-purple-900/40 text-purple-700 dark:text-purple-300',
  }
  return (
    <div className={`border rounded-xl px-4 py-3 ${toneCls[tone]}`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
        <span className="opacity-80">{icon}</span>
      </div>
      <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-white">{value}</p>
      <p className="text-[11px] opacity-80 mt-0.5">{sub}</p>
    </div>
  )
}
