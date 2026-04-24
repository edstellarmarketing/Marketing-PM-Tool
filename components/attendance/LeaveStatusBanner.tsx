'use client'

import { Target, ClipboardList } from 'lucide-react'
import type { AttendanceLeave } from '@/types'

interface Props {
  leaves: AttendanceLeave[]
  month: number
  year: number
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function dayCount(leaves: AttendanceLeave[], type: 'sick' | 'casual') {
  return leaves
    .filter(l => l.leave_type === type && l.status !== 'rejected')
    .reduce((sum, l) => sum + (l.is_half_day ? 0.5 : 1), 0)
}

export default function LeaveStatusBanner({ leaves, month }: Props) {
  const approvedLeaves = leaves.filter(l => l.status === 'approved')
  const pendingLeaves  = leaves.filter(l => l.status === 'pending')
  const sickDays   = dayCount(approvedLeaves, 'sick')
  const casualDays = dayCount(approvedLeaves, 'casual')
  const totalDays  = sickDays + casualDays
  const monthName  = MONTH_NAMES[month - 1]

  // Still eligible if no approved leaves (pending doesn't disqualify yet)
  if (approvedLeaves.length === 0) {
    return (
      <div className="bg-teal-50 border border-teal-200 rounded-xl px-5 py-3 flex items-start gap-3">
        <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Target size={14} className="text-teal-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-teal-800">Perfect attendance so far!</p>
          <p className="text-xs text-teal-600 mt-0.5">
            No approved leaves this month. You are eligible for the +25 pts bonus at month end.
            {pendingLeaves.length > 0 && ` (${pendingLeaves.length} request${pendingLeaves.length !== 1 ? 's' : ''} awaiting approval)`}
          </p>
        </div>
      </div>
    )
  }

  function fmt(n: number) {
    return n % 1 === 0 ? `${n}` : `${n}`
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <ClipboardList size={14} className="text-amber-500" />
      </div>
      <div>
        <p className="text-sm font-semibold text-amber-800 flex items-center gap-2 flex-wrap">
          {sickDays > 0 && (
            <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-semibold">
              🟠 {fmt(sickDays)} sick
            </span>
          )}
          {casualDays > 0 && (
            <span className="inline-flex items-center gap-1 bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full text-xs font-semibold">
              🔵 {fmt(casualDays)} casual
            </span>
          )}
          <span className="text-amber-700 font-normal">{fmt(totalDays)} day{totalDays !== 1 ? 's' : ''} logged in {monthName}</span>
        </p>
        <p className="text-xs text-amber-600 mt-0.5">
          You will not receive the perfect attendance bonus this month.
        </p>
      </div>
    </div>
  )
}
