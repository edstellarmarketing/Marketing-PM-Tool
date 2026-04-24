'use client'

import { useState } from 'react'
import { Check, X, Loader2, Clock, CheckCircle, XCircle } from 'lucide-react'
import type { AttendanceLeave } from '@/types'

interface LeaveWithProfile extends AttendanceLeave {
  profiles: { id: string; full_name: string; avatar_url: string | null } | null
}

interface Props {
  leaves: LeaveWithProfile[]
  onStatusChange?: (id: string, status: 'approved' | 'rejected') => void
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

const statusConfig = {
  pending:  { icon: <Clock size={10} />,       label: 'Pending',  cls: 'text-amber-600 bg-amber-50 border-amber-100'  },
  approved: { icon: <CheckCircle size={10} />, label: 'Approved', cls: 'text-teal-600 bg-teal-50 border-teal-100'    },
  rejected: { icon: <XCircle size={10} />,     label: 'Rejected', cls: 'text-red-500 bg-red-50 border-red-100'       },
}

export default function AdminAttendanceList({ leaves, onStatusChange }: Props) {
  const [processing, setProcessing] = useState<Record<string, 'approving' | 'rejecting'>>({})

  if (leaves.length === 0) {
    return (
      <div className="bg-teal-50 border border-teal-100 rounded-2xl p-10 text-center">
        <div className="text-3xl mb-2">✅</div>
        <p className="text-sm font-medium text-teal-700">No absences recorded for this month</p>
        <p className="text-xs text-teal-500 mt-1">Everyone is on track for perfect attendance!</p>
      </div>
    )
  }

  async function handleAction(id: string, action: 'approved' | 'rejected') {
    setProcessing(prev => ({ ...prev, [id]: action === 'approved' ? 'approving' : 'rejecting' }))
    try {
      const res = await fetch(`/api/attendance/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      })
      if (res.ok) onStatusChange?.(id, action)
    } finally {
      setProcessing(prev => { const p = { ...prev }; delete p[id]; return p })
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Leave Type</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Note</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {leaves.map(leave => {
            const sc    = statusConfig[leave.status]
            const state = processing[leave.id]
            return (
              <tr key={leave.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtDate(leave.date)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {leave.profiles?.avatar_url ? (
                      <img src={leave.profiles.avatar_url} alt={leave.profiles.full_name}
                        className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                        {leave.profiles ? initials(leave.profiles.full_name) : '?'}
                      </div>
                    )}
                    <span className="text-gray-800 font-medium">{leave.profiles?.full_name ?? 'Unknown'}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${
                    leave.leave_type === 'sick' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'
                  }`}>
                    {leave.leave_type === 'sick' ? '🟠 Sick' : '🔵 Casual'}
                    {leave.is_half_day && <span className="ml-1 text-[10px] font-bold opacity-70">½</span>}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sc.cls}`}>
                    {sc.icon}
                    {sc.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{leave.note ?? '—'}</td>
                <td className="px-4 py-3">
                  {leave.status === 'pending' && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleAction(leave.id, 'approved')}
                        disabled={!!state}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 disabled:opacity-50 transition-colors"
                      >
                        {state === 'approving' ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction(leave.id, 'rejected')}
                        disabled={!!state}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                      >
                        {state === 'rejecting' ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
                        Reject
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
