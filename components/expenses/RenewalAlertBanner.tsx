'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { RENEWAL_URGENT_DAYS } from '@/lib/expense-constants'
import type { SubscriptionRow } from '@/components/expenses/SubscriptionsClient'


function daysUntil(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  const target = new Date(y, m - 1, day)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

const usd = (n: number | null) =>
  n === null ? '' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

// Sits at the top of the dashboard, above everything, and only appears when
// something is genuinely urgent — overdue, or renewing inside
// RENEWAL_URGENT_DAYS. A banner that is always there stops being read.
export default function RenewalAlertBanner() {
  const [urgent, setUrgent] = useState<SubscriptionRow[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/expenses/subscriptions?status=active&dueWithin=${RENEWAL_URGENT_DAYS}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!cancelled && Array.isArray(d)) setUrgent(d) })
      .catch(() => { /* the banner is an extra; never break the dashboard for it */ })
    return () => { cancelled = true }
  }, [])

  if (urgent.length === 0) return null

  const overdue = urgent.filter(s => daysUntil(s.ends_on!) < 0)
  const total = urgent.reduce((a, s) => a + (s.amount_usd ?? 0), 0)

  return (
    <Link
      href="/expenses/subscriptions"
      className="block rounded-xl border-2 border-red-400 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-red-900 dark:text-red-200">
            {overdue.length > 0
              ? overdue.length === 1
                ? '1 subscription is past its renewal date'
                : `${overdue.length} subscriptions are past their renewal date`
              : `${urgent.length} subscription${urgent.length === 1 ? '' : 's'} renew${urgent.length === 1 ? 's' : ''} within ${RENEWAL_URGENT_DAYS} days`}
            {total > 0 && <span className="font-semibold"> · {usd(total)}</span>}
          </p>
          <p className="text-xs text-red-800 dark:text-red-300 mt-0.5 truncate">
            {urgent.slice(0, 4).map(s => {
              const d = daysUntil(s.ends_on!)
              return `${s.name} (${d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'today' : `${d}d`})`
            }).join(' · ')}
            {urgent.length > 4 && ` and ${urgent.length - 4} more`}
          </p>
          <p className="text-xs font-medium text-red-700 dark:text-red-400 mt-1">
            Open subscriptions →
          </p>
        </div>
      </div>
    </Link>
  )
}
