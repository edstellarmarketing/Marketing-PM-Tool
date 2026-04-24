'use client'

import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import type { TaskDateChangeRequest } from '@/types'

interface Props {
  taskId: string
  currentStart: string | null
  currentDue: string | null
  onSubmitted: (request: TaskDateChangeRequest) => void
}

export default function DateChangeRequestForm({ taskId, currentStart, currentDue, onSubmitted }: Props) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState(currentStart ?? '')
  const [due, setDue] = useState(currentDue ?? '')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const res = await fetch(`/api/tasks/${taskId}/date-change-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requested_start_date: start || null,
        requested_due_date: due || null,
        reason: reason || undefined,
      }),
    })
    setSubmitting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data.error === 'string' ? data.error : 'Failed to submit request')
      return
    }
    const data = await res.json()
    onSubmitted(data as TaskDateChangeRequest)
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
      >
        <CalendarDays size={13} />
        Request date change from admin
      </button>
    )
  }

  return (
    <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-3 space-y-3">
      <p className="text-xs font-medium text-blue-900">Request new dates — an admin will review before they're applied.</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">New Start Date</label>
          <input
            type="date"
            value={start}
            onChange={e => setStart(e.target.value)}
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">New Due Date</label>
          <input
            type="date"
            value={due}
            onChange={e => setDue(e.target.value)}
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
        <textarea
          rows={2}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Why do you need these dates changed?"
          className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null) }}
          className="px-3 py-1.5 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
