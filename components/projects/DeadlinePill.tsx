'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Timer } from 'lucide-react'
import type { ProjectStatus } from '@/types'

interface Props {
  endDate: string | null
  status: ProjectStatus
}

const DAY_MS = 86_400_000

// `end_date` is date-only, so the deadline is that day's local end-of-day —
// a project due 11 Jul is not overdue at 09:00 on 11 Jul.
function deadlineOf(endDate: string) {
  const d = new Date(endDate)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

function startOfDay(t: number) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Calendar days, not ceil(ms / DAY_MS) — the latter counts the partial current
// day and renders a deadline of tomorrow as "2d left".
function daysUntil(endDate: string, now: number) {
  return Math.round((startOfDay(deadlineOf(endDate)) - startOfDay(now)) / DAY_MS)
}

function clock(ms: number) {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':')
}

export interface DeadlineState {
  /** Countdown applies: has an end date, and is neither completed nor archived. */
  tracked: boolean
  /** Deadline has passed on a project still expected to finish. */
  passed: boolean
  /** Today is the due date; the clock is ticking. */
  isDueToday: boolean
  /** Calendar days remaining; negative once overdue. */
  days: number
  /** Milliseconds to the deadline; negative once overdue. */
  diff: number
}

/**
 * One source of truth for deadline state, so the card tint, the header pill and
 * the overdue banner can never disagree. Only ticks on the final day.
 */
export function useDeadline(endDate: string | null, status: ProjectStatus): DeadlineState {
  // Seeded once at mount (Date.now() in a render body would break React's
  // purity rule); only the due-today branch advances it.
  const [now, setNow] = useState(() => Date.now())

  const tracked = Boolean(endDate) && status !== 'completed' && status !== 'archived'
  const diff = endDate ? deadlineOf(endDate) - now : 0
  const days = endDate ? daysUntil(endDate, now) : 0
  const isDueToday = tracked && diff >= 0 && days === 0

  useEffect(() => {
    if (!isDueToday) return
    const tick = () => setNow(Date.now())
    // Paint the clock on the next frame rather than waiting a full second.
    const frame = requestAnimationFrame(tick)
    const id = setInterval(tick, 1000)
    return () => {
      cancelAnimationFrame(frame)
      clearInterval(id)
    }
  }, [isDueToday])

  return { tracked, passed: tracked && diff < 0, isDueToday, days, diff }
}

/** "3 days" / "1 day" — for the overdue banner copy. */
export function overdueLabel(days: number) {
  const n = -days
  return `${n} ${n === 1 ? 'day' : 'days'}`
}

export default function DeadlinePill({ endDate, status }: Props) {
  const { tracked, passed, isDueToday, days, diff } = useDeadline(endDate, status)

  if (!tracked || !endDate) return null

  let cls: string
  let icon = <Timer size={12} />
  let label: string

  if (passed) {
    cls = 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
    icon = <AlertTriangle size={12} />
    label = `${-days}d over`
  } else if (isDueToday) {
    cls = 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
    label = clock(diff)
  } else {
    cls =
      days <= 7
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
    label = `${days}d left`
  }

  return (
    <span
      className={'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium tabular-nums ' + cls}
      title={`Due ${new Date(endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`}
    >
      {isDueToday && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
      {!isDueToday && icon}
      <span suppressHydrationWarning>{label}</span>
    </span>
  )
}
