'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

const statuses = ['', 'todo', 'in_progress', 'review', 'done', 'blocked']
const priorities = ['', 'low', 'medium', 'high', 'critical']
const categories = ['', 'content', 'social', 'email', 'ads', 'seo', 'design', 'other']

const statusLabel: Record<string, string> = {
  '': 'All Statuses', todo: 'To Do', in_progress: 'In Progress',
  review: 'Review', done: 'Done', blocked: 'Blocked',
}

const MONTHS = [
  { value: '', label: 'All Months' },
  { value: '1',  label: 'January' },
  { value: '2',  label: 'February' },
  { value: '3',  label: 'March' },
  { value: '4',  label: 'April' },
  { value: '5',  label: 'May' },
  { value: '6',  label: 'June' },
  { value: '7',  label: 'July' },
  { value: '8',  label: 'August' },
  { value: '9',  label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
]

const now = new Date()
const YEARS = Array.from({ length: 3 }, (_, i) => String(now.getFullYear() - i))

export default function TaskFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`${pathname}?${params.toString()}`)
  }, [router, pathname, searchParams])

  const selectCls = 'text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="flex flex-wrap gap-3">
      {/* Month */}
      <select
        value={searchParams.get('month') ?? ''}
        onChange={e => setParam('month', e.target.value)}
        className={selectCls}
      >
        {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>

      {/* Year */}
      <select
        value={searchParams.get('year') ?? ''}
        onChange={e => setParam('year', e.target.value)}
        className={selectCls}
      >
        <option value="">All Years</option>
        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
      </select>

      {/* Status */}
      <select
        value={searchParams.get('status') ?? ''}
        onChange={e => setParam('status', e.target.value)}
        className={selectCls}
      >
        {statuses.map(s => <option key={s} value={s}>{statusLabel[s] ?? s}</option>)}
      </select>

      {/* Priority */}
      <select
        value={searchParams.get('priority') ?? ''}
        onChange={e => setParam('priority', e.target.value)}
        className={selectCls}
      >
        {priorities.map(p => <option key={p} value={p}>{p ? p.charAt(0).toUpperCase() + p.slice(1) : 'All Priorities'}</option>)}
      </select>

      {/* Category */}
      <select
        value={searchParams.get('category') ?? ''}
        onChange={e => setParam('category', e.target.value)}
        className={selectCls}
      >
        {categories.map(c => <option key={c} value={c}>{c ? c.charAt(0).toUpperCase() + c.slice(1) : 'All Categories'}</option>)}
      </select>
    </div>
  )
}
