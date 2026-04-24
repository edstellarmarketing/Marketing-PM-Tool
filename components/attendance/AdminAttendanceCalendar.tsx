'use client'

import type { AttendanceLeave } from '@/types'

interface LeaveWithProfile extends AttendanceLeave {
  profiles: { id: string; full_name: string; avatar_url: string | null } | null
}

interface Props {
  year: number
  month: number
  leaves: LeaveWithProfile[]
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function firstDayOffset(year: number, month: number) {
  const day = new Date(year, month - 1, 1).getDay()
  return day === 0 ? 6 : day - 1
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function AdminAttendanceCalendar({ year, month, leaves }: Props) {
  // Group leaves by date
  const byDate = new Map<string, LeaveWithProfile[]>()
  for (const l of leaves) {
    const arr = byDate.get(l.date) ?? []
    arr.push(l)
    byDate.set(l.date, arr)
  }

  const totalDays = daysInMonth(year, month)
  const offset    = firstDayOffset(year, month)
  const cells     = offset + totalDays

  function isoDate(day: number) {
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
  }

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

          const iso        = isoDate(day)
          const dayLeaves  = byDate.get(iso) ?? []
          const visible    = dayLeaves.slice(0, 2)
          const overflow   = dayLeaves.length - visible.length

          return (
            <div
              key={iso}
              className="relative min-h-[80px] border border-gray-100 rounded-lg p-1.5 hover:bg-gray-50 transition-colors"
            >
              <span className="text-xs text-gray-400 leading-none">{day}</span>
              {dayLeaves.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-0.5">
                  {visible.map(l => (
                    <div
                      key={l.id}
                      title={`${l.profiles?.full_name ?? 'Unknown'} — ${l.leave_type === 'sick' ? 'Sick' : 'Casual'} Leave`}
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 cursor-default ${
                        l.leave_type === 'sick'
                          ? 'bg-orange-400 ring-orange-200'
                          : 'bg-sky-400 ring-sky-200'
                      }`}
                    >
                      {l.profiles ? initials(l.profiles.full_name) : '?'}
                    </div>
                  ))}
                  {overflow > 0 && (
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-500">
                      +{overflow}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
