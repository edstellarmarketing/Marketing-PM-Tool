'use client'

import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { Trash2, Circle, CircleDot, CheckCircle2, Send, Clock, CheckCheck, XCircle, Pencil, Plus, X } from 'lucide-react'
import type { Goal, ChecklistItem, ChecklistItemStatus, GoalApprovalStatus } from '@/types'

const CYCLE: ChecklistItemStatus[] = ['todo', 'in_progress', 'done']

function nextStatus(s: ChecklistItemStatus): ChecklistItemStatus {
  return CYCLE[(CYCLE.indexOf(s) + 1) % CYCLE.length]
}

const itemCfg: Record<ChecklistItemStatus, { icon: React.ReactNode; label: string; cls: string }> = {
  todo:        { icon: <Circle size={16} />,      label: 'Yet to Start', cls: 'text-gray-400' },
  in_progress: { icon: <CircleDot size={16} />,   label: 'In Progress',  cls: 'text-blue-500' },
  done:        { icon: <CheckCircle2 size={16} />, label: 'Done',         cls: 'text-green-500' },
}

const approvalBadge: Record<GoalApprovalStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  draft:            { label: 'Draft',             cls: 'bg-gray-100 text-gray-500',     icon: null },
  pending_approval: { label: 'Awaiting Approval', cls: 'bg-yellow-100 text-yellow-700', icon: <Clock size={11} /> },
  approved:         { label: 'Approved',           cls: 'bg-green-100 text-green-700',   icon: <CheckCheck size={11} /> },
  rejected:         { label: 'Rejected',           cls: 'bg-red-100 text-red-700',       icon: <XCircle size={11} /> },
}

function barColor(p: number) {
  if (p >= 100) return 'bg-green-500'
  if (p >= 60)  return 'bg-blue-500'
  if (p >= 30)  return 'bg-orange-400'
  return 'bg-gray-300'
}

function statusLabel(p: number) {
  if (p >= 100) return { label: 'Achieved',    color: 'text-green-600' }
  if (p >= 60)  return { label: 'On Track',    color: 'text-blue-600' }
  if (p >= 30)  return { label: 'At Risk',     color: 'text-orange-500' }
  return         { label: 'Not Started', color: 'text-gray-500' }
}

interface Props {
  goal: Goal
  linkedTaskCount: number
  completedTaskCount: number
  onDelete?: (id: string) => void
  onChecklistUpdate?: (goalId: string, itemId: string, status: ChecklistItemStatus) => void
  onGoalAction?: (goalId: string, action: 'submit' | 'approve' | 'reject', note?: string) => Promise<void>
  onChecklistEdit?: (goalId: string, checklist: ChecklistItem[]) => Promise<void>
  readonly?: boolean
  isAdmin?: boolean
}

export default function GoalCard({
  goal, linkedTaskCount, completedTaskCount, onDelete, onChecklistUpdate, onGoalAction, onChecklistEdit, readonly, isAdmin,
}: Props) {
  const type = goal.type ?? 'one_time'
  const approvalStatus: GoalApprovalStatus = goal.approval_status ?? 'draft'

  const [editing, setEditing] = useState(false)
  const [editItems, setEditItems] = useState<ChecklistItem[]>([])
  const [newItemTitle, setNewItemTitle] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const canEdit = type === 'checklist' && !readonly && !!onChecklistEdit &&
    (approvalStatus === 'draft' || approvalStatus === 'rejected')

  function startEdit() {
    setEditItems(goal.checklist ? [...goal.checklist] : [])
    setNewItemTitle('')
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setEditItems([])
    setNewItemTitle('')
  }

  function addItem() {
    const title = newItemTitle.trim()
    if (!title) return
    setEditItems(prev => [...prev, { id: crypto.randomUUID(), title, status: 'todo' }])
    setNewItemTitle('')
  }

  function removeItem(id: string) {
    setEditItems(prev => prev.filter(i => i.id !== id))
  }

  async function saveEdit() {
    if (!onChecklistEdit) return
    setEditSaving(true)
    await onChecklistEdit(goal.id, editItems)
    setEditSaving(false)
    setEditing(false)
  }

  let progress: number
  if (type === 'checklist' && goal.checklist && goal.checklist.length > 0) {
    const done = goal.checklist.filter(i => i.status === 'done').length
    progress = Math.round((done / goal.checklist.length) * 100)
  } else if (linkedTaskCount > 0) {
    progress = completedTaskCount === linkedTaskCount ? 100 : 0
  } else {
    progress = goal.progress
  }

  const earnedPts = type === 'one_time'
    ? (progress === 100 ? goal.score_weight : 0)
    : Math.round(goal.score_weight * progress / 100)

  const { label, color } = statusLabel(progress)

  const doneCount = type === 'checklist' && goal.checklist
    ? goal.checklist.filter(i => i.status === 'done').length
    : completedTaskCount

  const totalCount = type === 'checklist' && goal.checklist
    ? goal.checklist.length
    : linkedTaskCount

  const checklistLocked = type === 'checklist' && approvalStatus !== 'approved'

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-gray-900">{goal.title}</p>
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded font-medium',
              type === 'checklist' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'
            )}>
              {type === 'checklist' ? '☑ Checklist' : '⚡ One-time'}
            </span>
            {type === 'checklist' && (
              <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium flex items-center gap-1', approvalBadge[approvalStatus].cls)}>
                {approvalBadge[approvalStatus].icon}
                {approvalBadge[approvalStatus].label}
              </span>
            )}
          </div>
          {goal.target_metric && (
            <p className="text-sm text-gray-500 mt-0.5">Target: {goal.target_metric}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {goal.category && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium capitalize">
              {goal.category}
            </span>
          )}
          <span className="text-xs font-medium text-gray-400">{goal.score_weight} pts</span>
          {canEdit && !editing && (
            <button
              onClick={startEdit}
              title="Edit checklist items"
              className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors"
            >
              <Pencil size={14} />
            </button>
          )}
          {!readonly && isAdmin && onDelete && !editing && (
            <button
              onClick={() => onDelete(goal.id)}
              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Rejection note */}
      {type === 'checklist' && approvalStatus === 'rejected' && goal.approval_note && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
          <span className="font-medium">Admin feedback: </span>{goal.approval_note}
        </div>
      )}

      {/* Edit mode */}
      {editing && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <p className="text-xs font-medium text-gray-500">Edit Checklist Items</p>
          {editItems.map(item => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="text-sm flex-1 text-gray-700">{item.title}</span>
              <button
                onClick={() => removeItem(item.id)}
                className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <input
              type="text"
              value={newItemTitle}
              onChange={e => setNewItemTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              placeholder="New checklist item…"
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button
              onClick={addItem}
              disabled={!newItemTitle.trim()}
              className="p-1.5 rounded-lg bg-gray-100 hover:bg-blue-100 text-gray-500 hover:text-blue-600 disabled:opacity-40 transition-colors"
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={saveEdit}
              disabled={editSaving || editItems.length === 0}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {editSaving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              onClick={cancelEdit}
              className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Checklist items (view mode) */}
      {!editing && type === 'checklist' && goal.checklist && goal.checklist.length > 0 && (
        <div className="space-y-1.5 border-t border-gray-100 pt-3">
          {checklistLocked && !isAdmin && (
            <p className="text-xs text-gray-400 italic mb-2">
              {approvalStatus === 'pending_approval'
                ? 'Awaiting admin approval before you can update items.'
                : approvalStatus === 'rejected'
                ? 'Revise your goal and resubmit for approval.'
                : 'Submit this goal for admin approval to start tracking.'}
            </p>
          )}
          {goal.checklist.map(item => {
            const cfg = itemCfg[item.status]
            const canUpdate = !readonly && !!onChecklistUpdate && !checklistLocked
            return (
              <div key={item.id} className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => canUpdate && onChecklistUpdate!(goal.id, item.id, nextStatus(item.status))}
                  disabled={!canUpdate}
                  title={canUpdate ? `${cfg.label} — click to advance` : cfg.label}
                  className={cn(
                    'flex-shrink-0 transition-colors',
                    cfg.cls,
                    canUpdate ? 'hover:opacity-70 cursor-pointer' : 'cursor-default opacity-60'
                  )}
                >
                  {cfg.icon}
                </button>
                <span className={cn(
                  'text-sm flex-1 min-w-0 truncate',
                  item.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700'
                )}>
                  {item.title}
                </span>
                <span className={cn('text-xs flex-shrink-0', cfg.cls)}>
                  {cfg.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Approval actions */}
      {!editing && type === 'checklist' && onGoalAction && !readonly && (
        <div className="border-t border-gray-100 pt-3">
          {!isAdmin && (approvalStatus === 'draft' || approvalStatus === 'rejected') && (
            <button
              onClick={() => onGoalAction(goal.id, 'submit')}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Send size={12} />
              {approvalStatus === 'rejected' ? 'Revise & Resubmit' : 'Submit for Approval'}
            </button>
          )}
          {isAdmin && approvalStatus === 'pending_approval' && (
            <AdminApprovalActions goalId={goal.id} onGoalAction={onGoalAction} />
          )}
        </div>
      )}

      {/* Progress bar + stats */}
      {!editing && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className={cn('text-xs font-medium', color)}>{label}</span>
            <span className="text-xs text-gray-500">
              {totalCount > 0
                ? `${doneCount}/${totalCount} done · ${earnedPts}/${goal.score_weight} pts`
                : `${progress}% · ${earnedPts}/${goal.score_weight} pts`}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', barColor(progress))}
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
          {type === 'one_time' && (
            <p className="text-xs text-gray-400 mt-1">Points awarded only on full completion</p>
          )}
        </div>
      )}
    </div>
  )
}

function AdminApprovalActions({
  goalId,
  onGoalAction,
}: {
  goalId: string
  onGoalAction: (goalId: string, action: 'submit' | 'approve' | 'reject', note?: string) => Promise<void>
}) {
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  async function handle(action: 'approve' | 'reject') {
    setLoading(true)
    await onGoalAction(goalId, action, action === 'reject' ? note : undefined)
    setLoading(false)
    setRejecting(false)
    setNote('')
  }

  if (rejecting) {
    return (
      <div className="space-y-2">
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Feedback for the team member (required)…"
          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-red-400"
          rows={2}
        />
        <div className="flex gap-2">
          <button
            onClick={() => handle('reject')}
            disabled={!note.trim() || loading}
            className="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
          >
            Send Feedback
          </button>
          <button
            onClick={() => { setRejecting(false); setNote('') }}
            className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handle('approve')}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
      >
        <CheckCheck size={12} /> Approve Goal
      </button>
      <button
        onClick={() => setRejecting(true)}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 font-medium"
      >
        <XCircle size={12} /> Reject
      </button>
    </div>
  )
}
