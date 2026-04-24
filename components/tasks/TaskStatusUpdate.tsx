'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const statuses = ['todo', 'in_progress', 'review', 'done', 'blocked'] as const
const statusLabel: Record<string, string> = {
  todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done', blocked: 'Blocked',
}

interface Props {
  taskId: string
  currentStatus: string
  isAdmin?: boolean
  blockDone?: boolean
  blockDoneReason?: string
}

export default function TaskStatusUpdate({ taskId, currentStatus, isAdmin = false, blockDone = false, blockDoneReason }: Props) {
  const router = useRouter()
  const [status, setStatus] = useState(currentStatus)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const statusChanged = status !== currentStatus
  const isMarkingDone = status === 'done' && statusChanged
  const noteRequired = !isAdmin && statusChanged

  async function handleUpdate() {
    if (!statusChanged && !note.trim()) return

    if (noteRequired && !note.trim()) {
      setError(
        isMarkingDone
          ? 'Please describe the work you completed — what was done, what was delivered, and any relevant details — before marking this task as done.'
          : 'A comment is required when changing the task status.'
      )
      return
    }

    setLoading(true)
    setError(null)
    const res = await fetch(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note: note || undefined }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to update')
      return
    }
    router.refresh()
    setNote('')
  }

  const notePlaceholder = isMarkingDone && !isAdmin
    ? 'Describe what you completed — what was done, what was delivered, any links or details…'
    : noteRequired
    ? 'Add a comment explaining this status change (required)…'
    : 'Add a note (optional)'

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setError(null) }}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {statuses.map(s => (
            <option key={s} value={s} disabled={s === 'done' && blockDone} title={s === 'done' && blockDone ? blockDoneReason : undefined}>
              {statusLabel[s]}{s === 'done' && blockDone ? ' (blocked)' : ''}
            </option>
          ))}
        </select>
        <button
          onClick={handleUpdate}
          disabled={loading || (!statusChanged && !note.trim()) || (status === 'done' && blockDone)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Saving…' : 'Update'}
        </button>
      </div>

      {isMarkingDone && !isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-800">
          <p className="font-medium">Comment required — describe your completed work</p>
          <p className="mt-0.5 text-blue-700">
            Before marking done, explain what was completed, what was delivered, and include any relevant links or details. This will be reviewed for approval.
          </p>
        </div>
      )}

      <textarea
        placeholder={notePlaceholder}
        value={note}
        onChange={e => { setNote(e.target.value); if (error) setError(null) }}
        rows={isMarkingDone && !isAdmin ? 3 : 2}
        className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 resize-none transition-colors ${
          error ? 'border-red-400 focus:ring-red-400' : 'border-gray-200 focus:ring-blue-500'
        }`}
      />

      {noteRequired && !error && (
        <p className="text-xs text-gray-500">
          {isMarkingDone ? 'Detailed completion notes are required before marking done.' : 'A comment is required when changing status.'}
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
