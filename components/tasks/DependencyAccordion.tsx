'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, ExternalLink, CheckCircle, XCircle, Zap, CalendarDays, User as UserIcon, AlertCircle } from 'lucide-react'
import { cn, formatDate, isOverdue } from '@/lib/utils'

const statusStyles: Record<string, string> = {
  todo:        'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  review:      'bg-yellow-100 text-yellow-700',
  done:        'bg-green-100 text-green-700',
  blocked:     'bg-red-100 text-red-700',
}

const statusLabels: Record<string, string> = {
  todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done', blocked: 'Blocked',
}

export interface DependencyChildData {
  id: string
  title: string
  description: string | null
  status: string
  approval_status: string
  user_id: string
  due_date: string | null
  start_date: string | null
  completion_date: string | null
  score_weight: number
  score_earned: number
  task_type: string | null
  complexity: string | null
  subtasks: { id: string; title: string; completed: boolean }[] | null
  approval_note: string | null
  assignee: { full_name: string; avatar_url: string | null } | null
}

interface Props {
  child: DependencyChildData
  canReview: boolean
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function DependencyAccordion({ child, canReview }: Props) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const overdue = isOverdue(child.due_date, child.status)
  const isPendingApproval = child.status === 'done' && child.approval_status === 'pending_approval'
  const isApproved = child.status === 'done' && child.approval_status === 'approved'
  const completedSubs = (child.subtasks ?? []).filter(s => s.completed).length
  const totalSubs = (child.subtasks ?? []).length

  async function review(action: 'approve' | 'reject') {
    setBusy(action); setErr(null)
    const res = await fetch(`/api/tasks/${child.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: action === 'approve' ? 'approve_dependency' : 'reject_dependency',
        note: note.trim() || undefined,
      }),
    })
    setBusy(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setErr(data.error ?? 'Action failed.')
      return
    }
    router.refresh()
  }

  return (
    <div
      className={cn(
        'border rounded-xl bg-white shadow-sm overflow-hidden transition-shadow',
        isPendingApproval ? 'border-yellow-300 ring-1 ring-yellow-100' :
        isApproved ? 'border-green-200' :
        overdue ? 'border-red-200' :
        'border-gray-200',
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        aria-expanded={isOpen}
        className="w-full flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors text-left"
      >
        <ChevronRight
          size={16}
          className={cn('text-gray-400 mt-0.5 flex-shrink-0 transition-transform', isOpen && 'rotate-90')}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-gray-900 leading-snug truncate">{child.title}</h4>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide', statusStyles[child.status])}>
                  {statusLabels[child.status] ?? child.status}
                </span>
                {isPendingApproval && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 font-bold uppercase tracking-wide">
                    Awaiting Approval
                  </span>
                )}
                {isApproved && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-bold uppercase tracking-wide flex items-center gap-1">
                    <CheckCircle size={9} /> Approved
                  </span>
                )}
                {child.assignee && (
                  <span className="text-[11px] text-gray-600 flex items-center gap-1">
                    {child.assignee.avatar_url ? (
                      <img src={child.assignee.avatar_url} alt={child.assignee.full_name} className="w-4 h-4 rounded-full object-cover" />
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white text-[8px] font-bold flex items-center justify-center">
                        {initials(child.assignee.full_name)}
                      </span>
                    )}
                    {child.assignee.full_name}
                  </span>
                )}
                {child.due_date && (
                  <span className={cn(
                    'text-[11px] flex items-center gap-1',
                    overdue ? 'text-red-600 font-semibold' : 'text-gray-500',
                  )}>
                    <CalendarDays size={10} /> {formatDate(child.due_date)}{overdue && ' • Overdue'}
                  </span>
                )}
                {child.score_weight > 0 && (
                  <span className="text-[11px] text-blue-700 flex items-center gap-1 font-medium">
                    <Zap size={10} /> {isApproved ? `${child.score_earned}/${child.score_weight}` : child.score_weight} pts
                  </span>
                )}
              </div>
            </div>
            {canReview && isPendingApproval && (
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setIsOpen(true); setShowNote(true) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setIsOpen(true); setShowNote(true) } }}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <CheckCircle size={12} /> Review
              </div>
            )}
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-gray-100 bg-gray-50/40 px-4 pl-12 py-4 space-y-4">
          {child.description && (
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{child.description}</p>
          )}

          {(totalSubs > 0 || child.start_date || child.completion_date) && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              {child.start_date && (
                <div>
                  <p className="text-gray-400 mb-0.5">Start</p>
                  <p className="font-medium text-gray-700">{formatDate(child.start_date)}</p>
                </div>
              )}
              {child.completion_date && (
                <div>
                  <p className="text-gray-400 mb-0.5">Completed</p>
                  <p className="font-medium text-green-700">{formatDate(child.completion_date)}</p>
                </div>
              )}
              {totalSubs > 0 && (
                <div>
                  <p className="text-gray-400 mb-0.5">Sub-tasks</p>
                  <p className="font-medium text-gray-700">{completedSubs}/{totalSubs} done</p>
                </div>
              )}
            </div>
          )}

          {child.approval_note && (
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600">
              <span className="font-medium text-gray-700">Last review note:</span> {child.approval_note}
            </div>
          )}

          {canReview && isPendingApproval && (
            <div className="bg-white border border-yellow-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-yellow-800 flex items-center gap-1">
                <AlertCircle size={12} /> Approve or reject this dependency
              </p>
              {showNote && (
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Optional note for the assignee…"
                  maxLength={2000}
                  className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => review('approve')}
                  disabled={!!busy}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg flex items-center gap-1"
                >
                  <CheckCircle size={12} /> {busy === 'approve' ? 'Approving…' : 'Approve'}
                </button>
                <button
                  onClick={() => review('reject')}
                  disabled={!!busy}
                  title="Rejecting returns the task to In Progress for the assignee."
                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-700 text-xs font-semibold rounded-lg flex items-center gap-1"
                >
                  <XCircle size={12} /> {busy === 'reject' ? 'Rejecting…' : 'Reject'}
                </button>
                {!showNote && (
                  <button
                    type="button"
                    onClick={() => setShowNote(true)}
                    className="text-xs text-gray-500 hover:text-gray-700 underline"
                  >
                    Add a note
                  </button>
                )}
              </div>
              {err && <p className="text-xs text-red-600">{err}</p>}
            </div>
          )}

          <Link
            href={`/tasks/${child.id}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
          >
            View full task <ExternalLink size={11} />
          </Link>
        </div>
      )}
    </div>
  )
}
