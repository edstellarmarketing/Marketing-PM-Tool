'use client'

import { AlertTriangle } from 'lucide-react'
import { useDeadline, overdueLabel } from './DeadlinePill'
import type { ProjectStatus } from '@/types'

interface Props {
  endDate: string | null
  status: ProjectStatus
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function DeadlinePassedBanner({ endDate, status }: Props) {
  const { passed, days } = useDeadline(endDate, status)

  if (!passed || !endDate) return null

  return (
    <div
      role="alert"
      className="flex items-start gap-3 p-4 rounded-xl border border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
    >
      <AlertTriangle size={20} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
      <div>
        <p className="text-sm font-semibold text-red-800 dark:text-red-200">
          This project has passed its deadline
        </p>
        <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">
          Due {formatDate(endDate)} — {overdueLabel(days)} overdue. Update the end date or mark the
          project completed.
        </p>
      </div>
    </div>
  )
}
