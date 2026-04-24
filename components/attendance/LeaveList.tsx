'use client'

import { X, Loader2, Clock, CheckCircle, XCircle } from 'lucide-react'
import { useState } from 'react'
import type { AttendanceLeave } from '@/types'

interface Props {
  leaves: AttendanceLeave[]
  month: number
  year: number
  onRemove: (id: string) => Promise<AttendanceLeave | null>
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

const statusBadge = {
  pending:  { icon: <Clock size={10} />,       label: 'Pending',  cls: 'text-amber-600 bg-amber-50 border-amber-100'  },
  approved: { icon: <CheckCircle size={10} />, label: 'Approved', cls: 'text-teal-600 bg-teal-50 border-teal-100'    },
  rejected: { icon: <XCircle size={10} />,     label: 'Rejected', cls: 'text-red-500 bg-red-50 border-red-100'       },
}

export default function LeaveList({ leaves, month, year, onRemove }: Props) {
  const [removing, setRemoving] = useState<string | null>(null)
  const [errors,   setErrors]   = useState<Record<string, string>>({})

  if (leaves.length === 0) return null

  async function handleRemove(id: string) {
    setRemoving(id)
    setErrors(prev => { const e = { ...prev }; delete e[id]; return e })
    const result = await onRemove(id)
    setRemoving(null)
    if (result === null) {
      setErrors(prev => ({ ...prev, [id]: 'Approved leaves cannot be removed' }))
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        {MONTH_NAMES[month - 1]} {year} — Leave Requests
      </p>
      <div className="divide-y divide-gray-100">
        {leaves.map(leave => {
          const sb = statusBadge[leave.status]
          return (
            <div key={leave.id} className="py-2.5 space-y-1">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-700 w-28 flex-shrink-0">{fmtDate(leave.date)}</span>
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${
                  leave.leave_type === 'sick' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'
                }`}>
                  {leave.leave_type === 'sick' ? '🟠 Sick' : '🔵 Casual'}
                  {leave.is_half_day && <span className="ml-1 text-[10px] font-bold opacity-70">½</span>}
                </span>
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${sb.cls}`}>
                  {sb.icon}
                  {sb.label}
                </span>
                <span className="text-xs text-gray-400 flex-1 truncate">{leave.note ?? '—'}</span>
                {leave.status !== 'approved' && (
                  <button
                    onClick={() => handleRemove(leave.id)}
                    disabled={removing === leave.id}
                    className="p-1.5 text-gray-300 hover:text-red-400 rounded hover:bg-red-50 flex-shrink-0 disabled:opacity-50 transition-colors"
                    title="Cancel leave request"
                  >
                    {removing === leave.id ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                  </button>
                )}
              </div>
              {errors[leave.id] && (
                <p className="text-xs text-red-500 ml-28">{errors[leave.id]}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
