'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Loader2, Clock, CheckCircle, XCircle } from 'lucide-react'
import type { AttendanceLeave } from '@/types'

interface Props {
  date: string
  existingLeave: AttendanceLeave | null
  onAdd: (leave_type: 'sick' | 'casual', is_half_day: boolean, note: string) => Promise<void>
  onRemove: (id: string) => Promise<AttendanceLeave | null>
  onClose: () => void
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function leaveLabel(leave: AttendanceLeave) {
  const base = leave.leave_type === 'sick' ? 'Sick Leave' : 'Casual Leave'
  return leave.is_half_day ? `${base} (Half Day)` : base
}

const statusConfig = {
  pending:  { icon: <Clock size={11} />,        label: 'Pending approval',   cls: 'text-amber-600 bg-amber-50'  },
  approved: { icon: <CheckCircle size={11} />,  label: 'Approved',           cls: 'text-teal-600 bg-teal-50'   },
  rejected: { icon: <XCircle size={11} />,      label: 'Rejected',           cls: 'text-red-500 bg-red-50'     },
}

export default function LeavePopover({ date, existingLeave, onAdd, onRemove, onClose }: Props) {
  const [note,    setNote]    = useState('')
  const [loading, setLoading] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  async function handleAdd(leave_type: 'sick' | 'casual', is_half_day: boolean) {
    setLoading(true)
    await onAdd(leave_type, is_half_day, note)
    setLoading(false)
  }

  async function handleRemove() {
    if (!existingLeave) return
    setLoading(true)
    setRemoveError(null)
    const result = await onRemove(existingLeave.id)
    setLoading(false)
    if (result === null) {
      // null means blocked (approved)
      setRemoveError('Approved leaves cannot be removed')
    }
  }

  const status = existingLeave?.status ?? null
  const sc = status ? statusConfig[status] : null

  return (
    <div
      ref={ref}
      className="absolute z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-3 min-w-[210px] left-1/2 -translate-x-1/2 mt-1"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">{fmtDate(date)}</span>
        <button onClick={onClose} className="text-gray-300 hover:text-gray-500 p-0.5">
          <X size={13} />
        </button>
      </div>

      {existingLeave ? (
        <div className="space-y-2">
          {/* Leave type badge */}
          <div className={`text-xs font-medium px-2 py-1 rounded-lg w-full text-center ${
            existingLeave.leave_type === 'sick' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'
          }`}>
            {leaveLabel(existingLeave)}
          </div>

          {/* Status badge */}
          {sc && (
            <div className={`flex items-center justify-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg ${sc.cls}`}>
              {sc.icon}
              {sc.label}
            </div>
          )}

          {existingLeave.note && (
            <p className="text-xs text-gray-400 truncate">{existingLeave.note}</p>
          )}

          {removeError && (
            <p className="text-xs text-red-500 bg-red-50 rounded px-2 py-1">{removeError}</p>
          )}

          {status !== 'approved' && (
            <button
              onClick={handleRemove}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 size={11} className="animate-spin" /> : null}
              {status === 'rejected' ? 'Remove rejected leave' : 'Cancel leave request'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-400 mb-1">Apply for leave:</p>

          {/* Sick row */}
          <div className="flex gap-1.5">
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleAdd('sick', false)}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 size={11} className="animate-spin" /> : <span>🟠</span>}
              Sick
            </button>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleAdd('sick', true)}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-orange-600 bg-orange-50/60 border border-dashed border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 size={11} className="animate-spin" /> : <span>🟠</span>}
              ½ Sick
            </button>
          </div>

          {/* Casual row */}
          <div className="flex gap-1.5">
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleAdd('casual', false)}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 size={11} className="animate-spin" /> : <span>🔵</span>}
              Casual
            </button>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={() => handleAdd('casual', true)}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-sky-600 bg-sky-50/60 border border-dashed border-sky-200 rounded-lg hover:bg-sky-100 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 size={11} className="animate-spin" /> : <span>🔵</span>}
              ½ Casual
            </button>
          </div>

          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Reason (optional)…"
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
          />
          <p className="text-[10px] text-gray-400 text-center">Leave request will be sent for admin approval</p>
        </div>
      )}
    </div>
  )
}
