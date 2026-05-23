'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronRight, List, Building2 } from 'lucide-react'

interface UserWithTaskCounts {
  id: string
  full_name: string
  avatar_url?: string | null
  department: string | null
  total: number
  done: number
}

interface Props {
  year: number
  month: number
  users: UserWithTaskCounts[]
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

type ViewMode = 'list' | 'department'

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function Avatar({ user, size = 36 }: { user: UserWithTaskCounts; size?: number }) {
  const cls = size === 28
    ? 'w-7 h-7 text-[10px]'
    : 'w-9 h-9 text-xs'
  if (user.avatar_url) {
    return <img src={user.avatar_url} alt={user.full_name} className={`rounded-full object-cover ${cls}`} />
  }
  return (
    <div className={`rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold flex items-center justify-center ${cls}`}>
      {initials(user.full_name)}
    </div>
  )
}

const DEPT_TONES: { border: string; bg: string; header: string }[] = [
  { border: 'border-blue-200 dark:border-blue-900/50',     bg: 'bg-blue-50/40 dark:bg-blue-950/20',     header: 'text-blue-700 dark:text-blue-300 bg-blue-100/60 dark:bg-blue-950/40' },
  { border: 'border-emerald-200 dark:border-emerald-900/50', bg: 'bg-emerald-50/40 dark:bg-emerald-950/20', header: 'text-emerald-700 dark:text-emerald-300 bg-emerald-100/60 dark:bg-emerald-950/40' },
  { border: 'border-amber-200 dark:border-amber-900/50',     bg: 'bg-amber-50/40 dark:bg-amber-950/20',     header: 'text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-950/40' },
  { border: 'border-purple-200 dark:border-purple-900/50',   bg: 'bg-purple-50/40 dark:bg-purple-950/20',   header: 'text-purple-700 dark:text-purple-300 bg-purple-100/60 dark:bg-purple-950/40' },
  { border: 'border-rose-200 dark:border-rose-900/50',       bg: 'bg-rose-50/40 dark:bg-rose-950/20',       header: 'text-rose-700 dark:text-rose-300 bg-rose-100/60 dark:bg-rose-950/40' },
  { border: 'border-cyan-200 dark:border-cyan-900/50',       bg: 'bg-cyan-50/40 dark:bg-cyan-950/20',       header: 'text-cyan-700 dark:text-cyan-300 bg-cyan-100/60 dark:bg-cyan-950/40' },
]

export default function MonthDetailClient({ year, month, users }: Props) {
  const [view, setView] = useState<ViewMode>('list')

  const grouped = useMemo(() => {
    const map = new Map<string, UserWithTaskCounts[]>()
    for (const u of users) {
      const dept = u.department?.trim() || 'Unassigned'
      const arr = map.get(dept) ?? []
      arr.push(u)
      map.set(dept, arr)
    }
    const entries = Array.from(map.entries()).sort(([a], [b]) => {
      if (a === 'Unassigned') return 1
      if (b === 'Unassigned') return -1
      return a.localeCompare(b)
    })
    return entries
  }, [users])

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-6xl mx-auto w-full">
      <div className="flex-shrink-0">
        <Link
          href="/admin/monthly-tasks"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 mb-3"
        >
          <ArrowLeft size={14} />
          Monthly Tasks
        </Link>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{MONTHS[month - 1]} {year}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {users.length} active user{users.length === 1 ? '' : 's'} working on tasks this month
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900 shadow-sm">
            <ViewButton active={view === 'list'} onClick={() => setView('list')} icon={<List size={14} />} label="List" />
            <ViewButton active={view === 'department'} onClick={() => setView('department')} icon={<Building2 size={14} />} label="By Department" />
          </div>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          No active users have tasks in {MONTHS[month - 1]} {year} yet.
        </div>
      ) : view === 'list' ? (
        <ListView year={year} month={month} users={users} />
      ) : (
        <DepartmentView year={year} month={month} groups={grouped} />
      )}
    </div>
  )
}

function ViewButton({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
    >
      {icon}
      {label}
    </button>
  )
}

function ListView({ year, month, users }: { year: number; month: number; users: UserWithTaskCounts[] }) {
  return (
    <div className="flex-1 min-h-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-y-auto">
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {users.map(u => {
          const pct = u.total === 0 ? 0 : Math.round((u.done / u.total) * 100)
          const allDone = u.total > 0 && u.done === u.total
          return (
            <li key={u.id}>
              <Link
                href={`/admin/monthly-tasks/${year}/${String(month).padStart(2, '0')}/${u.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar user={u} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.full_name}</p>
                    {u.department && <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{u.department}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {u.done} / {u.total} done · {pct}%
                  </span>
                  {allDone ? (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
                      Complete
                    </span>
                  ) : (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900">
                      Active
                    </span>
                  )}
                  <ChevronRight size={16} className="text-gray-400" />
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function DepartmentView({
  year, month, groups,
}: { year: number; month: number; groups: [string, UserWithTaskCounts[]][] }) {
  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-fr">
      {groups.map(([dept, deptUsers], idx) => {
        const tone = DEPT_TONES[idx % DEPT_TONES.length]
        const totalTasks = deptUsers.reduce((s, u) => s + u.total, 0)
        const doneTasks = deptUsers.reduce((s, u) => s + u.done, 0)
        const pct = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100)
        return (
          <section
            key={dept}
            className={`flex flex-col min-h-0 rounded-xl border ${tone.border} ${tone.bg} overflow-hidden`}
          >
            <header className={`flex items-center justify-between gap-2 px-3 py-2 border-b ${tone.border} ${tone.header}`}>
              <div className="min-w-0">
                <h2 className="text-xs font-semibold uppercase tracking-wide truncate">{dept}</h2>
                <p className="text-[10px] opacity-80">
                  {deptUsers.length} user{deptUsers.length === 1 ? '' : 's'} · {doneTasks}/{totalTasks} done · {pct}%
                </p>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/80 dark:bg-gray-900/40 text-gray-700 dark:text-gray-200">
                {deptUsers.length}
              </span>
            </header>
            <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/60 dark:divide-gray-900/40">
              {deptUsers.map(u => {
                const allDone = u.total > 0 && u.done === u.total
                return (
                  <li key={u.id}>
                    <Link
                      href={`/admin/monthly-tasks/${year}/${String(month).padStart(2, '0')}/${u.id}`}
                      className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-white/70 dark:hover:bg-gray-900/40 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar user={u} size={28} />
                        <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{u.full_name}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${allDone ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
                          {u.done}/{u.total}
                        </span>
                        <ChevronRight size={12} className="text-gray-400" />
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
