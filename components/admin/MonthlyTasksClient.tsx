'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, X, UserPlus, Check, Search } from 'lucide-react'

export const MONTHLY_TASKS_STORAGE_KEY = 'monthly-tasks-added'

interface MemberOption {
  id: string
  full_name: string
  avatar_url?: string | null
}

interface Props {
  members: MemberOption[]
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
const MIN_MONTH = 6

function isMonthAllowed(year: number, monthIndex1: number) {
  if (year < MIN_YEAR) return false
  if (year === MIN_YEAR && monthIndex1 < MIN_MONTH) return false
  return true
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function Avatar({ user, ring = '' }: { user: MemberOption; ring?: string }) {
  const ringCls = ring ? `ring-2 ${ring}` : ''
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.full_name}
        title={user.full_name}
        className={`w-7 h-7 rounded-full object-cover ${ringCls}`}
      />
    )
  }
  return (
    <div
      title={user.full_name}
      className={`w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white text-[10px] font-bold flex items-center justify-center ${ringCls}`}
    >
      {initials(user.full_name)}
    </div>
  )
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

export default function MonthlyTasksClient({ members }: Props) {
  const router = useRouter()
  const now = new Date()
  const currentYear = Math.max(now.getFullYear(), MIN_YEAR)
  const currentMonth = isMonthAllowed(now.getFullYear(), now.getMonth() + 1)
    ? now.getMonth() + 1
    : MIN_MONTH

  const [userId, setUserId] = useState<string>('all')
  const [year, setYear] = useState<number>(currentYear)
  const [month, setMonth] = useState<number>(currentMonth)

  const [addUsersFor, setAddUsersFor] = useState<{ year: number; month: number } | null>(null)
  const [addedByMonth, setAddedByMonth] = useState<Record<string, string[]>>({})
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MONTHLY_TASKS_STORAGE_KEY)
      if (raw) setAddedByMonth(JSON.parse(raw))
    } catch {}
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(MONTHLY_TASKS_STORAGE_KEY, JSON.stringify(addedByMonth)) } catch {}
  }, [addedByMonth, hydrated])

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

  function openAddUsers(m: number) {
    setMonth(m)
    setAddUsersFor({ year, month: m })
  }

  function addUser(userId: string) {
    if (!addUsersFor) return
    const key = monthKey(addUsersFor.year, addUsersFor.month)
    setAddedByMonth(prev => {
      const list = prev[key] ?? []
      if (list.includes(userId)) return prev
      return { ...prev, [key]: [...list, userId] }
    })
  }

  function removeUser(userId: string) {
    if (!addUsersFor) return
    const key = monthKey(addUsersFor.year, addUsersFor.month)
    setAddedByMonth(prev => {
      const list = prev[key] ?? []
      return { ...prev, [key]: list.filter(id => id !== userId) }
    })
  }

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-white/90 dark:bg-gray-950/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="flex flex-wrap items-center gap-3">
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
              const addedIds = addedByMonth[monthKey(year, m)] ?? []
              const addedUsers = addedIds.map(id => memberById.get(id)).filter(Boolean) as MemberOption[]
              const visibleAvatars = addedUsers.slice(0, 6)
              const extraCount = addedUsers.length - visibleAvatars.length
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => openAddUsers(m)}
                  className={`border rounded-xl px-5 py-6 text-left transition-colors ${active ? style.active : style.idle}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-2xl font-bold uppercase tracking-wide">{MONTH_SHORT[m - 1]}</p>
                      <p className={`text-sm mt-1 ${active ? 'text-white/80' : 'opacity-70'}`}>{year}</p>
                    </div>
                    {addedUsers.length > 0 && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-white/60 dark:bg-gray-800/60'}`}>
                        {addedUsers.length}
                      </span>
                    )}
                  </div>
                  <div className="mt-4 min-h-[28px] flex items-center">
                    {addedUsers.length === 0 ? (
                      <p className={`text-xs ${active ? 'text-white/70' : 'opacity-60'}`}>No users added yet</p>
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
                </button>
              )
            })}
          </div>
        )}
      </div>

      {addUsersFor && (
        <AddUsersModal
          year={addUsersFor.year}
          month={addUsersFor.month}
          members={members}
          addedIds={addedByMonth[monthKey(addUsersFor.year, addUsersFor.month)] ?? []}
          onAdd={addUser}
          onRemove={removeUser}
          onClose={() => setAddUsersFor(null)}
          onDone={() => {
            const y = addUsersFor.year
            const m = String(addUsersFor.month).padStart(2, '0')
            setAddUsersFor(null)
            router.push(`/admin/monthly-tasks/${y}/${m}`)
          }}
        />
      )}
    </div>
  )
}

function AddUsersModal({
  year, month, members, addedIds, onAdd, onRemove, onClose, onDone,
}: {
  year: number
  month: number
  members: MemberOption[]
  addedIds: string[]
  onAdd: (userId: string) => void
  onRemove: (userId: string) => void
  onClose: () => void
  onDone: () => void
}) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')

  const addedSet = useMemo(() => new Set(addedIds), [addedIds])
  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter(m => m.full_name.toLowerCase().includes(q))
  }, [members, search])

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose()
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Add users to {MONTHS[month - 1]} {year}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {addedIds.length} of {members.length} added
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-2 pb-3">
          {filteredMembers.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No users match your search.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredMembers.map(m => {
                const added = addedSet.has(m.id)
                return (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar user={m} />
                      <span className="text-sm text-gray-900 dark:text-white truncate">{m.full_name}</span>
                    </div>
                    {added ? (
                      <button
                        type="button"
                        onClick={() => onRemove(m.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                      >
                        <Check size={12} />
                        Added
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAdd(m.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                      >
                        <UserPlus size={12} />
                        Add
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDone}
            disabled={addedIds.length === 0}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
