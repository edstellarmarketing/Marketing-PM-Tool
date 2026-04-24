'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import LeavePopover from './LeavePopover'
import type { AttendanceLeave } from '@/types'

interface Props {
  year: number
  month: number
  leaves: AttendanceLeave[]
  onAdd:    (date: string, leave_type: 'sick' | 'casual', is_half_day: boolean, note: string) => Promise<void>
  onRemove: (id: string) => Promise<AttendanceLeave | null>
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function firstDayOffset(year: number, month: number) {
  const day = new Date(year, month - 1, 1).getDay()
  return day === 0 ? 6 : day - 1
}

export default function AttendanceCalendar({ year, month, leaves, onAdd, onRemove }: Props) {
  const [openDate, setOpenDate] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  const leaveMap = new Map<string, AttendanceLeave>()
  for (const l of leaves) leaveMap.set(l.date, l)

  const totalDays = daysInMonth(year, month)
  const offset    = firstDayOffset(year, month)
  const cells     = offset + totalDays

  function isoDate(day: number) {
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
  }

  const handleAdd = useCallback(
    async (leave_type: 'sick' | 'casual', is_half_day: boolean, note: string) => {
      if (!openDate) return
      await onAdd(openDate, leave_type, is_half_day, note)
      setOpenDate(null)
    },
    [openDate, onAdd]
  )

  const handleRemove = useCallback(
    async (id: string) => {
      const result = await onRemove(id)
      setOpenDate(null)
      return result
    },
    [onRemove]
  )

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      {/* Day header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-xs text-gray-400 text-center font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: cells }, (_, i) => {
          const day = i - offset + 1
          if (day < 1) return <div key={`empty-${i}`} />

          const iso   = isoDate(day)
          const leave = leaveMap.get(iso)
          const isToday = iso === today
          const isOpen  = openDate === iso
          const status  = leave?.status ?? null

          const sick    = leave?.leave_type === 'sick'
          const half    = leave?.is_half_day

          const cellCls = cn(
            'relative text-sm text-center py-1.5 rounded-lg cursor-pointer transition-colors select-none',
            // Approved
            leave && status === 'approved' && sick  && !half && 'bg-orange-100 text-orange-700 font-semibold',
            leave && status === 'approved' && sick  && half  && 'bg-orange-50 text-orange-600 font-semibold border border-dashed border-orange-300',
            leave && status === 'approved' && !sick && !half && 'bg-sky-100 text-sky-700 font-semibold',
            leave && status === 'approved' && !sick && half  && 'bg-sky-50 text-sky-600 font-semibold border border-dashed border-sky-300',
            // Pending
            leave && status === 'pending' && sick  && 'bg-orange-50 text-orange-400 border border-dashed border-orange-200',
            leave && status === 'pending' && !sick && 'bg-sky-50 text-sky-400 border border-dashed border-sky-200',
            // Rejected
            leave && status === 'rejected' && 'bg-gray-100 text-gray-400',
            // No leave
            !leave && 'text-gray-700 hover:bg-gray-100',
            isToday && !leave && 'ring-2 ring-teal-400 ring-offset-1 font-semibold',
          )

          let indicator = ''
          if (leave) {
            if (status === 'pending')  indicator = '?'
            else if (status === 'rejected') indicator = '✗'
            else indicator = half ? (sick ? '½S' : '½C') : (sick ? 'S' : 'C')
          }

          return (
            <div
              key={iso}
              className={cellCls}
              onClick={() => setOpenDate(isOpen ? null : iso)}
            >
              <span className="leading-tight">{day}</span>
              {leave && (
                <div className="text-[9px] leading-none mt-0.5 font-bold opacity-70">
                  {indicator}
                </div>
              )}
              {isOpen && (
                <LeavePopover
                  date={iso}
                  existingLeave={leave ?? null}
                  onAdd={handleAdd}
                  onRemove={handleRemove}
                  onClose={() => setOpenDate(null)}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <div className="w-4 h-4 rounded bg-orange-100 border border-orange-200" />
          Approved sick
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <div className="w-4 h-4 rounded bg-sky-100 border border-sky-200" />
          Approved casual
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <div className="w-4 h-4 rounded bg-orange-50 border border-dashed border-orange-200" />
          Pending
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <div className="w-4 h-4 rounded bg-gray-100 border border-gray-200" />
          Rejected
        </div>
      </div>
    </div>
  )
}
