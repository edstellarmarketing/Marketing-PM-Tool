'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { cn, formatDate, isOverdue } from '@/lib/utils'
import { AlertCircle, Clock, Pencil, Trash2, CheckCircle, Loader2, Zap, Link as LinkIcon } from 'lucide-react'
import type { Task } from '@/types'

const priorityStyles: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

const statusStyles: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  review: 'bg-yellow-100 text-yellow-700',
  done: 'bg-green-100 text-green-700',
  blocked: 'bg-red-100 text-red-700',
}

const statusLabel: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
  blocked: 'Blocked',
}

const approvalBadge: Record<string, { label: string; cls: string } | null> = {
  draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-500' },
  pending_approval: { label: 'Score Pending', cls: 'bg-yellow-100 text-yellow-700' },
  approved: null, // active task — no badge needed
  rejected: null,
}

interface TaskCardProps {
  task: Task
  isAdmin?: boolean
  goalName?: string
  onQuickComplete?: (id: string) => void
  onStatusUpdate?: (id: string, status: string, note?: string) => Promise<void>
  onEdit?: (task: Task) => void
  onDelete?: (id: string) => void
}

export default function TaskCard({ task, isAdmin, goalName, onQuickComplete, onStatusUpdate, onEdit, onDelete }: TaskCardProps) {
  const overdue = isOverdue(task.due_date, task.status)
  const approval = approvalBadge[task.approval_status ?? 'approved']
  const isPendingApproval = task.approval_status === 'pending_approval'
  const isConfirmed = task.status === 'done' && task.approval_status === 'approved'
  const canEdit = !isConfirmed && (isAdmin || !isPendingApproval)
  const canDelete = isAdmin === true

  const [progressStatus, setProgressStatus] = useState<Task['status']>(task.status)
  const [progressNote, setProgressNote] = useState('')
  const [progressLoading, setProgressLoading] = useState(false)

  // Sync selector when task status changes externally (realtime / refresh)
  useEffect(() => { setProgressStatus(task.status) }, [task.status])

  async function handleProgressUpdate() {
    const statusChanged = progressStatus !== task.status
    const hasNote = !!progressNote.trim()
    if (!statusChanged && !hasNote) return
    setProgressLoading(true)
    await onStatusUpdate?.(task.id, progressStatus, progressNote.trim() || undefined)
    setProgressNote('')
    setProgressLoading(false)
  }

  return (
    <div className={cn(
      'bg-white dark:bg-gray-900 border rounded-xl p-4 hover:shadow-sm transition-shadow',
      overdue ? 'border-red-200' : 'border-gray-200 dark:border-gray-700'
    )}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={task.status === 'done'}
          onChange={() => task.status !== 'done' && onQuickComplete?.(task.id)}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Link href={`/tasks/${task.id}`} className="font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 line-clamp-1">
                {task.title}
              </Link>
              {task.parent_task_id && (
                <span className="flex items-center gap-1 text-[9px] font-black bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded uppercase tracking-tighter shrink-0">
                  <LinkIcon size={8} /> Dependency
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {canEdit && (
                <button
                  title="Edit task"
                  onClick={() => onEdit?.(task)}
                  className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                >
                  <Pencil size={14} />
                </button>
              )}
              {canDelete && (
                <button
                  title="Delete task"
                  onClick={() => onDelete?.(task.id)}
                  className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          {task.description && (
            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{task.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', priorityStyles[task.priority])}>
              {task.priority}
            </span>
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusStyles[task.status])}>
              {statusLabel[task.status]}
            </span>
            {approval && (
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', approval.cls)}>
                {approval.label}
              </span>
            )}
            {task.category && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                {task.category}
              </span>
            )}
            {goalName && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium flex items-center gap-1">
                🎯 {goalName}
              </span>
            )}
            {task.status === 'done' && !isPendingApproval && (
              <CheckCircle size={14} className="text-green-500" />
            )}
          </div>

          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              {overdue ? (
                <><AlertCircle size={12} className="text-red-500" /><span className="text-red-500">Overdue · {formatDate(task.due_date)}</span></>
              ) : task.due_date ? (
                <><Clock size={12} /><span>{formatDate(task.due_date)}</span></>
              ) : null}
            </div>
            {task.score_weight > 0 && (
              task.status === 'done' ? (
                <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                  <Zap size={10} /> {task.score_earned} pts earned
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  <Zap size={10} /> {task.score_weight} pts potential
                </span>
              )
            )}
          </div>

          {task.approval_note && isPendingApproval === false && task.status === 'in_progress' && (
            <p className="mt-2 text-xs text-orange-700 bg-orange-50 rounded px-2 py-1">
              Returned: {task.approval_note}
            </p>
          )}

          {/* Inline progress + notes — visible for all non-done tasks */}
          {task.status !== 'done' && onStatusUpdate && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 flex-shrink-0">Progress:</span>
                <select
                  value={progressStatus}
                  onChange={e => setProgressStatus(e.target.value as Task['status'])}
                  className="flex-1 text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">In Review</option>
                  <option value="done">Done</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <textarea
                value={progressNote}
                onChange={e => setProgressNote(e.target.value)}
                placeholder="Add a note… (optional)"
                rows={2}
                className="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder-gray-400"
              />
              <button
                onClick={handleProgressUpdate}
                disabled={progressLoading || (progressStatus === task.status && !progressNote.trim())}
                className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors font-medium"
              >
                {progressLoading ? <><Loader2 size={11} className="animate-spin" /> Saving…</> : 'Update'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
