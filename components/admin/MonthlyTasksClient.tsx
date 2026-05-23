'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'

interface MemberOption {
  id: string
  full_name: string
  avatar_url?: string | null
}

type Mode = 'admin' | 'member'

interface Props {
  members: MemberOption[]
  /** Map of 'YYYY-MM' -> non-admin user_ids who have ≥1 task with due_date in that month. */
  usersByMonth: Record<string, string[]>
  /** 'admin' (default) shows multi-user clusters and full filter row.
   *  'member' shows only the current user's avatar, larger, with no user filter. */
  mode?: Mode
  /** Required when mode='member'. Used to render the single avatar and build tile hrefs. */
  currentUserId?: string
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const MONTH_TILE_STYLE: Record<number, { idle: string; active: string }> = {
  1:  { idle: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',                     active: 'bg-red-600 text-white border-red-600' },
  2:  { idle: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900', active: 'bg-orange-600 text-white border-orange-600' },
  3:  { idle: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',       active: 'bg-amber-600 text-white border-amber-600' },
  4:  { idle: 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-900', active: 'bg-yellow-600 text-white border-yellow-600' },
  5:  { idle: 'bg-lime-50 text-lime-700 border-lime-200 hover:bg-lime-100 dark:bg-lime-950/40 dark:text-lime-300 dark:border-lime-900',               active: 'bg-lime-600 text-white border-lime-600' },
  6:  { idle: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900',         active: 'bg-green-600 text-white border-green-600' },
  7:  { idle: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900', active: 'bg-emerald-600 text-white border-emerald-600' },
  8:  { idle: 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900',                 active: 'bg-teal-600 text-white border-teal-600' },
  9:  { idle: 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900',                 active: 'bg-cyan-600 text-white border-cyan-600' },
  10: { idle: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',                 active: 'bg-blue-600 text-white border-blue-600' },
  11: { idle: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900',   active: 'bg-indigo-600 text-white border-indigo-600' },
  12: { idle: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900',   active: 'bg-purple-600 text-white border-purple-600' },
}

const MIN_YEAR = 2026
const MIN_MONTH = 5

function isMonthAllowed(year: number, monthIndex1: number) {
  if (year < MIN_YEAR) return false
  if (year === MIN_YEAR && monthIndex1 < MIN_MONTH) return false
  return true
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function Avatar({ user, ring = '', size = 'sm' }: { user: MemberOption; ring?: string; size?: 'sm' | 'lg' }) {
  const ringCls = ring ? `ring-2 ${ring}` : ''
  const sizeCls = size === 'lg' ? 'w-14 h-14 text-base' : 'w-7 h-7 text-[10px]'
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.full_name}
        title={user.full_name}
        className={`rounded-full object-cover ${sizeCls} ${ringCls}`}
      />
    )
  }
  return (
    <div
      title={user.full_name}
      className={`rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold flex items-center justify-center ${sizeCls} ${ringCls}`}
    >
      {initials(user.full_name)}
    </div>
  )
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

export default function MonthlyTasksClient({ members, usersByMonth, mode = 'admin', currentUserId }: Props) {
  const isMember = mode === 'member'
  const now = new Date()
  const currentYear = Math.max(now.getFullYear(), MIN_YEAR)
  const currentMonth = isMonthAllowed(now.getFullYear(), now.getMonth() + 1)
    ? now.getMonth() + 1
    : MIN_MONTH

  const [userId, setUserId] = useState<string>('all')
  const [year, setYear] = useState<number>(currentYear)
  const [month, setMonth] = useState<number>(currentMonth)

  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members])

  const years = useMemo(() => {
    const max = Math.max(currentYear, MIN_YEAR) + 3
    const out: number[] = []
    for (let y = MIN_YEAR; y <= max; y++) out.push(y)
    return out
  }, [currentYear])

  const visibleMonths = useMemo(() => {
    const out: number[] = []
    for (let m = 1; m <= 12; m++) if (isMonthAllowed(year, m)) out.push(m)
    return out
  }, [year])

  useEffect(() => {
    if (!isMonthAllowed(year, month)) {
      setMonth(visibleMonths[0] ?? MIN_MONTH)
    }
  }, [year, month, visibleMonths])

  function usersForMonth(y: number, m: number): MemberOption[] {
    const ids = usersByMonth[monthKey(y, m)] ?? []
    const scoped = isMember && currentUserId
      ? ids.filter(id => id === currentUserId)
      : (userId === 'all' ? ids : ids.filter(id => id === userId))
    return scoped.map(id => memberById.get(id)).filter(Boolean) as MemberOption[]
  }

  function hrefForMonth(y: number, m: number): string {
    const mm = String(m).padStart(2, '0')
    if (isMember && currentUserId) return `/user/monthly-tasks/${y}/${mm}/${currentUserId}`
    return `/admin/monthly-tasks/${y}/${mm}`
  }

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="flex flex-wrap items-center gap-3">
          {!isMember && (
            <div className="flex flex-col">
              <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">User</label>
              <div className="relative">
                <select
                  value={userId}
                  onChange={e => setUserId(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
                >
                  <option value="all">All users</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}

          <div className="flex flex-col">
            <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Year</label>
            <div className="relative">
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                className="appearance-none pl-3 pr-8 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[110px]"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Month</label>
            <div className="relative">
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                className="appearance-none pl-3 pr-8 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[140px]"
              >
                {visibleMonths.map(m => (
                  <option key={m} value={m}>{MONTHS[m - 1]}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        {visibleMonths.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No months available for {year}. Monthly tasks start from June 2026.</p>
        ) : (
          <div className="grid grid-cols-3 gap-5 w-full">
            {visibleMonths.map(m => {
              const style = MONTH_TILE_STYLE[m]
              const active = m === month
              const monthUsers = usersForMonth(year, m)
              const visibleAvatars = monthUsers.slice(0, 6)
              const extraCount = monthUsers.length - visibleAvatars.length
              const href = hrefForMonth(year, m)
              const memberHasTasks = isMember && monthUsers.length > 0
              const memberEmpty = isMember && monthUsers.length === 0
              return (
                <Link
                  key={m}
                  href={href}
                  onMouseEnter={() => setMonth(m)}
                  className={`border rounded-xl px-5 py-6 text-left transition-colors block ${active ? style.active : style.idle} ${memberEmpty ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-2xl font-bold uppercase tracking-wide">{MONTH_SHORT[m - 1]}</p>
                      <p className={`text-sm mt-1 ${active ? 'text-white/80' : 'opacity-70'}`}>{year}</p>
                    </div>
                    {!isMember && monthUsers.length > 0 && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-white/60 dark:bg-gray-800/60'}`}>
                        {monthUsers.length}
                      </span>
                    )}
                  </div>
                  <div className={`mt-4 flex items-center ${isMember ? 'min-h-[56px]' : 'min-h-[28px]'}`}>
                    {isMember ? (
                      memberHasTasks ? (
                        <Avatar user={monthUsers[0]} size="lg" ring={active ? 'ring-white/80' : 'ring-white dark:ring-gray-900'} />
                      ) : (
                        <p className={`text-xs ${active ? 'text-white/70' : 'opacity-60'}`}>No tasks this month</p>
                      )
                    ) : monthUsers.length === 0 ? (
                      <p className={`text-xs ${active ? 'text-white/70' : 'opacity-60'}`}>No users with tasks yet</p>
                    ) : (
                      <div className="flex items-center -space-x-2">
                        {visibleAvatars.map(u => (
                          <Avatar key={u.id} user={u} ring={active ? 'ring-white/80' : 'ring-white dark:ring-gray-900'} />
                        ))}
                        {extraCount > 0 && (
                          <span className={`w-7 h-7 rounded-full ring-2 ${active ? 'ring-white/80 bg-white/20 text-white' : 'ring-white dark:ring-gray-900 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'} text-[10px] font-bold flex items-center justify-center`}>
                            +{extraCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
