'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import AttendanceCalendar from '@/components/attendance/AttendanceCalendar'
import LeaveStatusBanner from '@/components/attendance/LeaveStatusBanner'
import LeaveList from '@/components/attendance/LeaveList'
import type { AttendanceLeave } from '@/types'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function prevMonth(month: number, year: number) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year }
}

function nextMonth(month: number, year: number) {
  return month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year }
}

export default function AttendancePage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())
  const [leaves, setLeaves] = useState<AttendanceLeave[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLeaves = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/attendance?month=${month}&year=${year}`)
      const data = await res.json()
      setLeaves(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { fetchLeaves() }, [fetchLeaves])

  function goTo(m: number, y: number) {
    setMonth(m)
    setYear(y)
  }

  const handleAdd = useCallback(async (date: string, leave_type: 'sick' | 'casual', is_half_day: boolean, note: string) => {
    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, leave_type, is_half_day, note: note || null }),
    })
    if (res.ok) {
      const newLeave: AttendanceLeave = await res.json()
      setLeaves(prev => [...prev, newLeave].sort((a, b) => a.date.localeCompare(b.date)))
    }
  }, [])

  // Returns null if the delete was blocked (approved leave), the leave otherwise
  const handleRemove = useCallback(async (id: string): Promise<AttendanceLeave | null> => {
    const res = await fetch(`/api/attendance/${id}`, { method: 'DELETE' })
    if (res.status === 204) {
      setLeaves(prev => prev.filter(l => l.id !== id))
      return {} as AttendanceLeave // truthy non-null = success
    }
    // 403 means approved — bubble null so UI can show error
    return null
  }, [])

  const prev = prevMonth(month, year)
  const next = nextMonth(month, year)

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>
          <p className="text-sm text-gray-400 mt-0.5">Track your leaves and attendance bonus</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => goTo(prev.month, prev.year)}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-700 min-w-[90px] text-center">
            {MONTH_NAMES[month - 1].slice(0, 3)} {year}
          </span>
          <button
            onClick={() => goTo(next.month, next.year)}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Status banner */}
      {!loading && (
        <LeaveStatusBanner leaves={leaves} month={month} year={year} />
      )}

      {/* Calendar */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 flex items-center justify-center">
          <div className="text-sm text-gray-400">Loading…</div>
        </div>
      ) : (
        <AttendanceCalendar
          year={year}
          month={month}
          leaves={leaves}
          onAdd={handleAdd}
          onRemove={handleRemove}
        />
      )}

      {/* Leave list */}
      {!loading && (
        <LeaveList
          leaves={leaves}
          month={month}
          year={year}
          onRemove={handleRemove}
        />
      )}
    </div>
  )
}
