'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, ArrowRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { TaskDateChangeRequest } from '@/types'

type PendingRequest = TaskDateChangeRequest & {
  tasks: { id: string; title: string; user_id: string; start_date: string | null; due_date: string | null } | null
  requester: { full_name: string; avatar_url: string | null } | null
}

function displayDate(d: string | null) {
  return d ? formatDate(d) : '—'
}

export default function DateChangeRequestsPanel() {
  const [requests, setRequests] = useState<PendingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [noteMap, setNoteMap] = useState<Record<string, string>>({})
  const [processing, setProcessing] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/admin/date-change-requests')
      .then(r => r.json())
      .then(data => { setRequests(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function applyAction(id: string, action: 'approved' | 'rejected') {
    setProcessing(prev => new Set(prev).add(id))
    const res = await fetch(`/api/admin/date-change-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note: noteMap[id] ?? '' }),
    })
    setProcessing(prev => { const next = new Set(prev); next.delete(id); return next })
    if (res.ok) {
      setRequests(prev => prev.filter(r => r.id !== id))
    }
  }

  if (loading) return <div className="text-sm text-gray-400 py-4">Loading date change requests…</div>
  if (requests.length === 0) return <div className="text-sm text-gray-400 py-4 text-center">No date change requests pending. ✓</div>

  return (
    <div className="space-y-3">
      {requests.map(req => {
        const isProcessing = processing.has(req.id)
        return (
          <div key={req.id} className="border border-gray-200 rounded-xl p-4 bg-white">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm">{req.tasks?.title ?? 'Task'}</p>
                <p className="text-xs text-gray-500 mt-0.5">Requested by {req.requester?.full_name ?? 'Unknown'}</p>

                <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-gray-50 border border-gray-100 rounded-lg p-2">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-1">Start</p>
                    <p className="text-gray-600 flex items-center gap-1.5">
                      {displayDate(req.current_start_date)}
                      <ArrowRight size={11} className="text-gray-400" />
                      <span className="font-medium text-blue-700">{displayDate(req.requested_start_date)}</span>
                    </p>
                  </div>
                  <div className="bg-gray-50 border border-gray-100 rounded-lg p-2">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-1">Due</p>
                    <p className="text-gray-600 flex items-center gap-1.5">
                      {displayDate(req.current_due_date)}
                      <ArrowRight size={11} className="text-gray-400" />
                      <span className="font-medium text-blue-700">{displayDate(req.requested_due_date)}</span>
                    </p>
                  </div>
                </div>

                {req.reason && (
                  <blockquote className="mt-2 text-xs text-gray-600 bg-gray-50 border-l-2 border-gray-300 pl-2.5 py-1 italic">
                    {req.reason}
                  </blockquote>
                )}

                <input
                  type="text"
                  placeholder="Optional note to user…"
                  value={noteMap[req.id] ?? ''}
                  onChange={e => setNoteMap(prev => ({ ...prev, [req.id]: e.target.value }))}
                  className="mt-2 w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button
                  onClick={() => applyAction(req.id, 'approved')}
                  disabled={isProcessing}
                  className="flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg"
                >
                  <CheckCircle size={12} /> Approve
                </button>
                <button
                  onClick={() => applyAction(req.id, 'rejected')}
                  disabled={isProcessing}
                  className="flex items-center gap-1 px-2.5 py-1 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-700 text-xs font-medium rounded-lg"
                >
                  <XCircle size={12} /> Reject
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
