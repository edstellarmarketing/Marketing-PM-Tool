'use client'

import { useState } from 'react'
import { Check, X, Loader2 } from 'lucide-react'
import type { AttendanceLeave } from '@/types'

interface LeaveWithProfile extends AttendanceLeave {
  profiles: { id: string; full_name: string; avatar_url: string | null } | null
}

interface Props {
  leaves: LeaveWithProfile[]
  onStatusChange: (id: string, status: 'approved' | 'rejected') => void
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function AdminPendingLeaves({ leaves, onStatusChange }: Props) {
  const [processing, setProcessing] = useState<Record<string, 'approving' | 'rejecting'>>({})

  if (leaves.length === 0) return null

  async function handleAction(id: string, action: 'approved' | 'rejected') {
    setProcessing(prev => ({ ...prev, [id]: action === 'approved' ? 'approving' : 'rejecting' }))
    try {
      const res = await fetch(`/api/attendance/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      })
      if (res.ok) {
        onStatusChange(id, action)
      }
    } finally {
      setProcessing(prev => { const p = { ...prev }; delete p[id]; return p })
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-amber-100 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-amber-400 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
          {leaves.length}
        </span>
        <p className="text-sm font-semibold text-amber-800">Pending Leave Requests</p>
      </div>

      <div className="divide-y divide-amber-100">
        {leaves.map(leave => {
          const state = processing[leave.id]
          return (
            <div key={leave.id} className="flex items-center gap-3 px-5 py-3">
              {/* Avatar */}
              {leave.profiles?.avatar_url ? (
                <img src={leave.profiles.avatar_url} alt={leave.profiles.full_name}
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                  {leave.profiles ? initials(leave.profiles.full_name) : '?'}
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{leave.profiles?.full_name ?? 'Unknown'}</p>
                <p className="text-xs text-gray-500">{fmtDate(leave.date)}</p>
              </div>

              {/* Type badge */}
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${
                leave.leave_type === 'sick' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'
              }`}>
                {leave.leave_type === 'sick' ? '🟠 Sick' : '🔵 Casual'}
                {leave.is_half_day && <span className="ml-1 text-[10px] font-bold opacity-70">½</span>}
              </span>

              {leave.note && (
                <span className="text-xs text-gray-400 max-w-[120px] truncate hidden sm:block">{leave.note}</span>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => handleAction(leave.id, 'approved')}
                  disabled={!!state}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 disabled:opacity-50 transition-colors"
                >
                  {state === 'approving' ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                  Approve
                </button>
                <button
                  onClick={() => handleAction(leave.id, 'rejected')}
                  disabled={!!state}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                >
                  {state === 'rejecting' ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                  Reject
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
