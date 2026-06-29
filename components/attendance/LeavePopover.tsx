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
  const [leaveType, setLeaveType] = useState<'sick' | 'casual' | null>(null)
  const [halfDay,   setHalfDay]   = useState(false)
  const [note,      setNote]      = useState('')
  const [loading,   setLoading]   = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const reasonValid = note.trim().length > 0

  async function handleSubmit() {
    if (!leaveType || !reasonValid) return
    setLoading(true)
    await onAdd(leaveType, halfDay, note.trim())
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
      onClick={e => e.stopPropagation()}
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
          <p className="text-xs text-gray-400 mb-1">1. Choose leave type:</p>

          {/* Leave type selection */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => setLeaveType('sick')}
              disabled={loading}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                leaveType === 'sick'
                  ? 'text-orange-800 bg-orange-100 border-orange-400 ring-1 ring-orange-300'
                  : 'text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100'
              }`}
            >
              <span>🟠</span>
              Sick
            </button>
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => setLeaveType('casual')}
              disabled={loading}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                leaveType === 'casual'
                  ? 'text-sky-800 bg-sky-100 border-sky-400 ring-1 ring-sky-300'
                  : 'text-sky-700 bg-sky-50 border-sky-200 hover:bg-sky-100'
              }`}
            >
              <span>🔵</span>
              Casual
            </button>
          </div>

          {/* Half-day toggle */}
          <label
            onMouseDown={e => e.preventDefault()}
            className="flex items-center gap-2 text-xs text-gray-600 px-1 py-0.5 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              checked={halfDay}
              onChange={e => setHalfDay(e.target.checked)}
              disabled={loading}
              className="rounded border-gray-300 text-teal-500 focus:ring-teal-400"
            />
            Half day
          </label>

          <p className="text-xs text-gray-400 mb-1">2. Add a reason <span className="text-red-500">(required)</span>:</p>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Reason…"
            required
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
          />

          {/* Explicit submit */}
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={handleSubmit}
            disabled={loading || !leaveType || !reasonValid}
            title={!reasonValid ? 'A reason is required' : undefined}
            className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-semibold text-white bg-teal-500 rounded-lg hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : null}
            Submit leave request
          </button>
          <p className="text-[10px] text-gray-400 text-center">Leave request will be sent for admin approval</p>
        </div>
      )}
    </div>
  )
}
