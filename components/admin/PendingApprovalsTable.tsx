'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { CheckCircle, XCircle, Zap, ArrowRight, CalendarDays, Clock, History, Sparkles } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { volumeTierFor, DEFAULT_VOLUME_TIERS } from '@/lib/scoring'

type PendingApprovalType = 'task_completion' | 'date_change'
type ViewMode = 'pending' | 'history'

interface TaskCompletionDetails {
  task_type: string | null
  complexity: string | null
  score_weight: number
  score_earned: number
  due_date: string | null
  subtasks_total?: number
  subtasks_completed?: number
}

interface DateChangeDetails {
  task_id: string
  current_start_date: string | null
  current_due_date: string | null
  requested_start_date: string | null
  requested_due_date: string | null
  reason: string | null
}

interface ApprovalRow {
  id: string
  type: PendingApprovalType
  title: string
  status: string
  isDependency: boolean
  requestedBy: { id?: string; fullName: string; avatarUrl: string | null }
  reviewedBy: { id: string; fullName: string; avatarUrl: string | null } | null
  requestedAt: string
  reviewedAt: string | null
  note: string | null
  details: TaskCompletionDetails | DateChangeDetails
}

interface ApiResponse {
  items: ApprovalRow[]
  counts: { total: number; task_completion: number; date_change: number }
}

const taskTypeLabels: Record<string, string> = {
  monthly_task: '🔁 Monthly',
  new_implementation: '🚀 New Impl.',
  ai: '🤖 AI',
}

const complexityLabels: Record<string, string> = {
  easy: '🟢 Easy',
  medium: '🟡 Medium',
  difficult: '🔴 Difficult',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function userKey(row: ApprovalRow) {
  return row.requestedBy.id ?? row.requestedBy.fullName
}

function buildActionRequest(row: ApprovalRow, action: 'approved' | 'rejected', note: string, isAdmin: boolean) {
  if (row.type === 'task_completion') {
    // Admins use the admin endpoint; non-admins (assigners/parent-task owners) use the tasks endpoint
    if (isAdmin) {
      return {
        url: `/api/admin/tasks/${row.id}/approve`,
        body: { action, note },
      }
    }
    return {
      url: `/api/tasks/${row.id}`,
      body: {
        action: action === 'approved' ? 'approve_dependency' : 'reject_dependency',
        note: note || undefined,
      },
    }
  }
  // Date change requests (admin or assigner — role-checked server-side)
  return {
    url: `/api/admin/date-change-requests/${row.id}`,
    body: { action, note },
  }
}

function UserAvatar({ user }: { user: { fullName: string; avatarUrl: string | null } }) {
  return (
    <div className="flex items-center gap-2">
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.fullName} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
          {initials(user.fullName)}
        </div>
      )}
      <span className="text-sm text-gray-700 whitespace-nowrap">{user.fullName}</span>
    </div>
  )
}

function TaskCompletionDetailView({ details }: { details: TaskCompletionDetails }) {
  const subTotal = details.subtasks_total ?? 0
  const subDone = details.subtasks_completed ?? 0
  const tier = volumeTierFor(subDone, DEFAULT_VOLUME_TIERS)
  const showVolumeBadge = tier.name !== 'standard'
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5 items-center">
        {details.task_type && (
          <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">
            {taskTypeLabels[details.task_type] ?? details.task_type}
          </span>
        )}
        {details.complexity && (
          <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded font-medium">
            {complexityLabels[details.complexity] ?? details.complexity}
          </span>
        )}
        {details.score_weight > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded font-medium flex items-center gap-0.5">
            <Zap size={9} /> {details.score_weight} pts
          </span>
        )}
        {showVolumeBadge && (
          <span
            title={`${subDone}/${subTotal} subtasks completed → +${tier.bonus} complexity bonus${tier.name === 'massive' ? '. Flagged for admin review.' : ''}`}
            className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5 ${
              tier.name === 'massive' ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300' :
              tier.name === 'substantial' ? 'bg-purple-100 text-purple-700' :
              'bg-blue-100 text-blue-700'
            }`}
          >
            <Sparkles size={9} /> {tier.label} {tier.name === 'massive' ? '⚠ Review' : `+${tier.bonus}`}
          </span>
        )}
      </div>
      {(subTotal > 0 || details.due_date) && (
        <p className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
          {details.due_date && (
            <span className="flex items-center gap-1">
              <CalendarDays size={11} /> Due: {formatDate(details.due_date)}
            </span>
          )}
          {subTotal > 0 && (
            <span>· {subDone}/{subTotal} subtasks done</span>
          )}
        </p>
      )}
    </div>
  )
}

function DateChangeDetailView({ details }: { details: DateChangeDetails }) {
  const d = details
  return (
    <div className="space-y-1.5 text-xs text-gray-600">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-50 rounded-lg p-2">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-0.5">Start</p>
          <p className="flex items-center gap-1">
            <span className="text-gray-500">{d.current_start_date ? formatDate(d.current_start_date) : '—'}</span>
            <ArrowRight size={10} className="text-gray-300 flex-shrink-0" />
            <span className="font-medium text-blue-700">{d.requested_start_date ? formatDate(d.requested_start_date) : '—'}</span>
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-0.5">Due</p>
          <p className="flex items-center gap-1">
            <span className="text-gray-500">{d.current_due_date ? formatDate(d.current_due_date) : '—'}</span>
            <ArrowRight size={10} className="text-gray-300 flex-shrink-0" />
            <span className="font-medium text-blue-700">{d.requested_due_date ? formatDate(d.requested_due_date) : '—'}</span>
          </p>
        </div>
      </div>
      {d.reason && (
        <blockquote className="border-l-2 border-gray-300 pl-2 italic text-gray-500 text-[11px]">{d.reason}</blockquote>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'approved') {
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium"><CheckCircle size={11} /> Approved</span>
  }
  if (status === 'rejected') {
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium"><XCircle size={11} /> Rejected</span>
  }
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{status}</span>
}

interface PendingApprovalsTableProps {
  isAdmin: boolean
}

export default function PendingApprovalsTable({ isAdmin }: PendingApprovalsTableProps) {
  const [view, setView] = useState<ViewMode>('pending')
  const [items, setItems] = useState<ApprovalRow[]>([])
  const [counts, setCounts] = useState({ total: 0, task_completion: 0, date_change: 0 })
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [noteMap, setNoteMap] = useState<Record<string, string>>({})
  const [processing, setProcessing] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [selectedUser, setSelectedUser] = useState('')
  const [bulkNote, setBulkNote] = useState('')
  const [bulkError, setBulkError] = useState('')

  useEffect(() => {
    setLoading(true)
    setItems([])
    setFetchError('')
    setErrors({})
    setSelectedUser('')
    setBulkNote('')
    setBulkError('')
    fetch(`/api/admin/pending-approvals?view=${view}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error ?? `Request failed (${r.status})`)
        return data as ApiResponse
      })
      .then((data) => {
        setItems(Array.isArray(data.items) ? data.items : [])
        setCounts(data.counts ?? { total: 0, task_completion: 0, date_change: 0 })
        setLoading(false)
      })
      .catch((err: Error) => {
        setFetchError(err.message)
        setLoading(false)
      })
  }, [view])

  const usersWithRequests = useMemo(() => {
    const users = new Map<string, { key: string; name: string; count: number }>()
    for (const row of items) {
      const key = userKey(row)
      const current = users.get(key)
      if (current) {
        current.count += 1
      } else {
        users.set(key, { key, name: row.requestedBy.fullName, count: 1 })
      }
    }
    return Array.from(users.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [items])

  const selectedUserRows = selectedUser
    ? items.filter(row => userKey(row) === selectedUser)
    : []

  function removeRows(rows: ApprovalRow[]) {
    const ids = new Set(rows.map(row => row.id))
    const taskCount = rows.filter(row => row.type === 'task_completion').length
    const dateChangeCount = rows.filter(row => row.type === 'date_change').length
    setItems(prev => prev.filter(row => !ids.has(row.id)))
    setCounts(prev => ({
      total: Math.max(0, prev.total - rows.length),
      task_completion: Math.max(0, prev.task_completion - taskCount),
      date_change: Math.max(0, prev.date_change - dateChangeCount),
    }))
  }

  async function applyAction(row: ApprovalRow, action: 'approved' | 'rejected') {
    setProcessing(prev => new Set(prev).add(row.id))
    setErrors(prev => { const next = { ...prev }; delete next[row.id]; return next })

    const note = noteMap[row.id] ?? ''
    const { url, body } = buildActionRequest(row, action, note, isAdmin)
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    setProcessing(prev => { const next = new Set(prev); next.delete(row.id); return next })

    if (res.ok) {
      removeRows([row])
    } else {
      const data = await res.json().catch(() => ({}))
      setErrors(prev => ({ ...prev, [row.id]: data.error ?? 'Action failed. Please try again.' }))
    }
  }

  async function approveSelectedUserRequests() {
    if (selectedUserRows.length === 0) return

    const rows = [...selectedUserRows]
    const rowIds = rows.map(row => row.id)
    setBulkError('')
    setProcessing(prev => { const next = new Set(prev); rowIds.forEach(id => next.add(id)); return next })
    setErrors(prev => { const next = { ...prev }; rowIds.forEach(id => { delete next[id] }); return next })

    const results = await Promise.all(rows.map(async row => {
      const { url, body } = buildActionRequest(row, 'approved', bulkNote, isAdmin)
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) return { row, error: null }
      const data = await res.json().catch(() => ({}))
      return { row, error: data.error ?? 'Action failed. Please try again.' }
    }))

    setProcessing(prev => { const next = new Set(prev); rowIds.forEach(id => next.delete(id)); return next })

    const approvedRows = results.filter(result => !result.error).map(result => result.row)
    const failedRows = results.filter((result): result is { row: ApprovalRow; error: string } => Boolean(result.error))

    if (approvedRows.length > 0) removeRows(approvedRows)
    if (failedRows.length > 0) {
      setErrors(prev => {
        const next = { ...prev }
        failedRows.forEach(result => { next[result.row.id] = result.error })
        return next
      })
      setBulkError(`${failedRows.length} request${failedRows.length !== 1 ? 's' : ''} could not be approved.`)
    } else {
      setSelectedUser('')
      setBulkNote('')
    }
  }

  return (
    <div className="space-y-4">
      {/* Tab toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setView('pending')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            view === 'pending'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Clock size={14} />
          Pending
        </button>
        <button
          onClick={() => setView('history')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            view === 'history'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <History size={14} />
          History
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
      ) : fetchError ? (
        <div className="text-sm text-red-600 py-8 text-center">Failed to load: {fetchError}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="font-medium">
            {view === 'pending'
              ? isAdmin
                ? 'No pending approvals.'
                : 'No dependency tasks awaiting your approval.'
              : 'No approval history yet.'}
          </p>
        </div>
      ) : (
        <>
          {/* Summary row */}
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-medium">{counts.total} total</span>
            {counts.task_completion > 0 && (
              <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full font-medium">{counts.task_completion} task completion{counts.task_completion !== 1 ? 's' : ''}</span>
            )}
            {counts.date_change > 0 && (
              <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium">{counts.date_change} date change{counts.date_change !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Bulk approval bar — pending only */}
          {view === 'pending' && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                <label className="flex-1 min-w-0">
                  <span className="block text-xs font-medium text-gray-500 mb-1">Bulk approve by user</span>
                  <select
                    value={selectedUser}
                    onChange={e => { setSelectedUser(e.target.value); setBulkError('') }}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select user</option>
                    {usersWithRequests.map(user => (
                      <option key={user.key} value={user.key}>
                        {user.name} ({user.count})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex-1 min-w-0">
                  <span className="block text-xs font-medium text-gray-500 mb-1">Approval comment</span>
                  <input
                    type="text"
                    placeholder="Optional note for all selected approvals"
                    maxLength={2000}
                    value={bulkNote}
                    onChange={e => setBulkNote(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>

                <button
                  onClick={approveSelectedUserRequests}
                  disabled={selectedUserRows.length === 0 || selectedUserRows.some(row => processing.has(row.id))}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                >
                  <CheckCircle size={15} />
                  Approve all{selectedUserRows.length > 0 ? ` (${selectedUserRows.length})` : ''}
                </button>
              </div>
              {bulkError && <p className="text-xs text-red-600 mt-2">{bulkError}</p>}
            </div>
          )}

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              {view === 'pending' ? (
                <table className="w-full min-w-[800px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-xs text-gray-500 uppercase tracking-wide">
                      <th className="text-left py-3 px-4 font-medium">Type</th>
                      <th className="text-left py-3 px-4 font-medium">Request</th>
                      <th className="text-left py-3 px-4 font-medium">Requested by</th>
                      <th className="text-left py-3 px-4 font-medium">Requested at</th>
                      <th className="text-left py-3 px-4 font-medium">Comment</th>
                      <th className="py-3 px-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map(row => {
                      const isProcessing = processing.has(row.id)
                      return (
                        <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4 align-top">
                            <div className="flex flex-col gap-1 items-start">
                              {row.type === 'task_completion' ? (
                                <span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700 font-medium whitespace-nowrap">Task completion</span>
                              ) : (
                                <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium whitespace-nowrap">Date change</span>
                              )}
                              {row.isDependency && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 font-medium whitespace-nowrap">Dependency</span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4 align-top max-w-xs">
                            {row.type === 'task_completion' ? (
                              <Link href={`/tasks/${row.id}`} className="text-sm font-medium text-blue-600 hover:underline mb-1.5 block">{row.title}</Link>
                            ) : (
                              <Link href={`/tasks/${(row.details as DateChangeDetails).task_id}`} className="text-sm font-medium text-blue-600 hover:underline mb-1.5 block">{row.title}</Link>
                            )}
                            {row.type === 'task_completion' ? (
                              <TaskCompletionDetailView details={row.details as TaskCompletionDetails} />
                            ) : (
                              <DateChangeDetailView details={row.details as DateChangeDetails} />
                            )}
                          </td>

                          <td className="py-3 px-4 align-top">
                            <UserAvatar user={row.requestedBy} />
                          </td>

                          <td className="py-3 px-4 align-top">
                            <span className="text-xs text-gray-500 whitespace-nowrap">{formatTime(row.requestedAt)}</span>
                          </td>

                          <td className="py-3 px-4 align-top w-48">
                            <input
                              type="text"
                              placeholder="Optional note…"
                              maxLength={2000}
                              value={noteMap[row.id] ?? ''}
                              onChange={e => setNoteMap(prev => ({ ...prev, [row.id]: e.target.value }))}
                              className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            {errors[row.id] && (
                              <p className="text-[10px] text-red-600 mt-1">{errors[row.id]}</p>
                            )}
                          </td>

                          <td className="py-3 px-4 align-top">
                            <div className="flex flex-col gap-1.5 items-end">
                              <button
                                onClick={() => applyAction(row, 'approved')}
                                disabled={isProcessing}
                                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                              >
                                <CheckCircle size={12} /> Approve
                              </button>
                              <button
                                onClick={() => applyAction(row, 'rejected')}
                                disabled={isProcessing}
                                title={row.type === 'task_completion' ? 'Rejecting returns the task to In Progress.' : undefined}
                                className="flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-700 text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                              >
                                <XCircle size={12} /> Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="w-full min-w-[900px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr className="text-xs text-gray-500 uppercase tracking-wide">
                      <th className="text-left py-3 px-4 font-medium">Type</th>
                      <th className="text-left py-3 px-4 font-medium">Request</th>
                      <th className="text-left py-3 px-4 font-medium">Requested by</th>
                      <th className="text-left py-3 px-4 font-medium">Requested at</th>
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                      <th className="text-left py-3 px-4 font-medium">Reviewed by</th>
                      <th className="text-left py-3 px-4 font-medium">Reviewed at</th>
                      <th className="text-left py-3 px-4 font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4 align-top">
                          {row.type === 'task_completion' ? (
                            <span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700 font-medium whitespace-nowrap">Task completion</span>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium whitespace-nowrap">Date change</span>
                          )}
                        </td>

                        <td className="py-3 px-4 align-top max-w-xs">
                          {row.type === 'task_completion' ? (
                            <Link href={`/tasks/${row.id}`} className="text-sm font-medium text-blue-600 hover:underline mb-1.5 block">{row.title}</Link>
                          ) : (
                            <Link href={`/tasks/${(row.details as DateChangeDetails).task_id}`} className="text-sm font-medium text-blue-600 hover:underline mb-1.5 block">{row.title}</Link>
                          )}
                          {row.type === 'task_completion' ? (
                            <TaskCompletionDetailView details={row.details as TaskCompletionDetails} />
                          ) : (
                            <DateChangeDetailView details={row.details as DateChangeDetails} />
                          )}
                        </td>

                        <td className="py-3 px-4 align-top">
                          <UserAvatar user={row.requestedBy} />
                        </td>

                        <td className="py-3 px-4 align-top">
                          <span className="text-xs text-gray-500 whitespace-nowrap">{formatTime(row.requestedAt)}</span>
                        </td>

                        <td className="py-3 px-4 align-top">
                          <StatusBadge status={row.status} />
                        </td>

                        <td className="py-3 px-4 align-top">
                          {row.reviewedBy ? (
                            <UserAvatar user={row.reviewedBy} />
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>

                        <td className="py-3 px-4 align-top">
                          {row.reviewedAt ? (
                            <span className="text-xs text-gray-500 whitespace-nowrap">{formatTime(row.reviewedAt)}</span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>

                        <td className="py-3 px-4 align-top max-w-[200px]">
                          {row.note ? (
                            <p className="text-xs text-gray-600 break-words">{row.note}</p>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
