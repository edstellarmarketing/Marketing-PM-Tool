'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarClock } from 'lucide-react'

import { cn } from '@/lib/utils'
import { RENEWAL_HORIZON_DAYS, RENEWAL_URGENT_DAYS } from '@/lib/expense-constants'
import type { SubscriptionRow } from '@/components/expenses/SubscriptionsClient'

const usd = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function daysUntil(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  const target = new Date(y, m - 1, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

// Renewals due soon or already past. Scoped to status=active: two of the six
// subscriptions falling in the next 90 days are already cancelled, and nagging
// about something you have stopped paying for teaches people to ignore this.
export default function RenewalsWidget({ days = RENEWAL_HORIZON_DAYS }: { days?: number }) {
  const [rows, setRows] = useState<SubscriptionRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/expenses/subscriptions?status=active&dueWithin=${days}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!cancelled && Array.isArray(d)) setRows(d) })
      .catch(() => { /* a missing widget must not break the dashboard */ })
    return () => { cancelled = true }
  }, [days])

  if (!rows || rows.length === 0) return null

  // Inside the urgent band is actionable now; anything beyond it is planning.
  // Colouring the whole horizon red would make the urgent rows indistinguishable.
  const urgent = rows.filter(s => daysUntil(s.ends_on!) <= RENEWAL_URGENT_DAYS)
  const committed = rows.reduce((a, s) => a + (s.amount_usd ?? 0), 0)

  return (
    <div className={cn(
      'rounded-xl p-4 shadow-sm border',
      urgent.length > 0
        ? 'bg-red-50 dark:bg-red-950/20 border-red-300 dark:border-red-900'
        : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800',
    )}>
      <div className="flex items-center justify-between mb-1">
        <h2 className={cn('text-sm font-semibold flex items-center gap-1.5',
          urgent.length > 0 ? 'text-red-800 dark:text-red-300' : 'text-gray-900 dark:text-white')}>
          {urgent.length > 0
            ? <AlertTriangle size={15} className="text-red-600 dark:text-red-400" />
            : <CalendarClock size={15} className="text-gray-400" />}
          Renewals due
        </h2>
        <Link href="/expenses/subscriptions" className="text-xs text-blue-600 hover:underline">
          All subscriptions →
        </Link>
      </div>
      <p className={cn('text-xs mb-3', urgent.length > 0 ? 'text-red-700 dark:text-red-400' : 'text-gray-500')}>
        {urgent.length > 0
          ? `${urgent.length} need${urgent.length === 1 ? 's' : ''} attention now · ${usd(committed)} committed over ${days} days`
          : `Active subscriptions renewing within ${days} days · ${usd(committed)} committed`}
      </p>

      <ul className="divide-y divide-black/5 dark:divide-white/10">
        {rows.map(s => {
          const d = daysUntil(s.ends_on!)
          const isUrgent = d <= RENEWAL_URGENT_DAYS
          return (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className={cn('text-sm truncate',
                  isUrgent ? 'text-red-900 dark:text-red-200 font-semibold' : 'text-gray-900 dark:text-white')}>
                  {isUrgent && '⚠ '}{s.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {[s.owner_display, s.team_name].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={cn('text-sm font-semibold tabular-nums',
                  isUrgent ? 'text-red-900 dark:text-red-200' : 'text-gray-900 dark:text-white')}>
                  {usd(s.amount_usd)}
                </p>
                <p className={cn('text-xs tabular-nums',
                  d < 0 ? 'text-red-700 dark:text-red-400 font-bold'
                    : isUrgent ? 'text-red-600 dark:text-red-400 font-medium'
                    : 'text-gray-400')}>
                  {d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'renews today' : `in ${d}d`}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
