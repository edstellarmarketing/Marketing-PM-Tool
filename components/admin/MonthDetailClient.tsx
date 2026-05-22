'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { MONTHLY_TASKS_STORAGE_KEY } from './MonthlyTasksClient'

interface MemberOption {
  id: string
  full_name: string
  avatar_url?: string | null
}

interface Props {
  year: number
  month: number
  members: MemberOption[]
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function Avatar({ user }: { user: MemberOption }) {
  if (user.avatar_url) {
    return <img src={user.avatar_url} alt={user.full_name} className="w-9 h-9 rounded-full object-cover" />
  }
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs font-bold flex items-center justify-center">
      {initials(user.full_name)}
    </div>
  )
}

export default function MonthDetailClient({ year, month, members }: Props) {
  const [addedIds, setAddedIds] = useState<string[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MONTHLY_TASKS_STORAGE_KEY)
      if (raw) {
        const map = JSON.parse(raw) as Record<string, string[]>
        setAddedIds(map[monthKey(year, month)] ?? [])
      }
    } catch {}
    setHydrated(true)
  }, [year, month])

  const memberById = useMemo(() => new Map(members.map(m => [m.id, m])), [members])
  const addedUsers = addedIds.map(id => memberById.get(id)).filter(Boolean) as MemberOption[]

  // Placeholder status — every newly added user starts as Pending.
  // Wire to backend later to flip users to Active.
  const statusOf = (_userId: string): 'active' | 'pending' => 'pending'

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <Link
          href="/admin/monthly-tasks"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 mb-3"
        >
          <ArrowLeft size={14} />
          Monthly Tasks
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{MONTHS[month - 1]} {year}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {addedUsers.length} user{addedUsers.length === 1 ? '' : 's'} added to this month
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        {!hydrated ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : addedUsers.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No users have been added to {MONTHS[month - 1]} {year} yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {addedUsers.map(u => {
              const status = statusOf(u.id)
              return (
                <li key={u.id}>
                  <Link
                    href={`/admin/monthly-tasks/${year}/${String(month).padStart(2, '0')}/${u.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar user={u} />
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.full_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {status === 'active' ? (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
                          Active
                        </span>
                      ) : (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900">
                          Pending
                        </span>
                      )}
                      <ChevronRight size={16} className="text-gray-400" />
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
