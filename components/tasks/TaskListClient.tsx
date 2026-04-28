'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { cn, formatDate, isOverdue, stripHtml } from '@/lib/utils'
import { Pencil, Trash2, ChevronLeft, ChevronRight, ChevronDown, ExternalLink, Search, X, Zap, Info, Link as LinkIcon, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import type { Task } from '@/types'

const PAGE_SIZES = [10, 25, 50]

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

const priorityStyles: Record<string, string> = {
  low:      'bg-gray-100 text-gray-500',
  medium:   'bg-blue-100 text-blue-700',
  high:     'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

type SortCol = 'due_date' | 'days_remaining'

function getDaysRemaining(dueDate: string | null): number | null {
  if (!dueDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due   = new Date(dueDate); due.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

function DaysRemainingCell({ dueDate, status }: { dueDate: string | null; status: string }) {
  if (!dueDate || status === 'done') return <span className="text-gray-300 text-xs">—</span>
  const days = getDaysRemaining(dueDate)!
  if (days < 0) return (
    <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full whitespace-nowrap">
      {Math.abs(days)}d overdue
    </span>
  )
  if (days === 0) return (
    <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full whitespace-nowrap">
      Due today
    </span>
  )
  if (days <= 3) return (
    <span className="text-xs font-semibold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full whitespace-nowrap">
      {days}d left
    </span>
  )
  if (days <= 7) return (
    <span className="text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full whitespace-nowrap">
      {days}d left
    </span>
  )
  return (
    <span className="text-xs text-gray-500 whitespace-nowrap">{days}d left</span>
  )
}

function approvalCell(task: Task): { label: string; cls: string } | null {
  if (task.status === 'done' && task.approval_status === 'pending_approval')
    return { label: 'Score Pending', cls: 'text-yellow-600' }
  if (task.status === 'done' && task.approval_status === 'approved')
    return { label: 'Score Confirmed', cls: 'text-green-600' }
  return null
}

interface ProfileInfo {
  full_name: string
  avatar_url: string | null
  designation: string | null
}

interface Props {
  initialTasks: Task[]
  isAdmin?: boolean
  currentUserId?: string
  profileMap?: Record<string, ProfileInfo>
}

function OwnerCell({ userId, profileMap }: { userId: string; profileMap: Record<string, ProfileInfo> }) {
  const owner = profileMap[userId]
  if (!owner) return <span className="text-gray-300 text-xs">—</span>
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      {owner.avatar_url ? (
        <img src={owner.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-bold text-blue-600">{owner.full_name.charAt(0).toUpperCase()}</span>
        </div>
      )}
      <div>
        <p className="text-xs font-medium text-gray-800 leading-tight">{owner.full_name}</p>
        {owner.designation && <p className="text-[10px] text-gray-400 leading-tight">{owner.designation}</p>}
      </div>
    </div>
  )
}

function ScoreCell({ task }: { task: Task }) {
  if (task.score_weight <= 0) return <span className="text-xs text-gray-300">—</span>
  if (task.status === 'done') {
    return (
      <span className={cn(
        'flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full w-fit',
        task.score_earned > task.score_weight ? 'bg-green-100 text-green-700' : 'bg-green-50 text-green-600'
      )}>
        <Zap size={10} />
        {Math.round(task.score_earned * 100) / 100} pts
        {task.score_earned > task.score_weight && <span className="text-green-500">✦</span>}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full w-fit">
      <Zap size={10} />
      {Math.round(task.score_weight * 100) / 100} pts
    </span>
  )
}

export default function TaskListClient({ initialTasks, isAdmin, currentUserId, profileMap = {} }: Props) {
  const [tasks, setTasks] = useState(initialTasks)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [complexityFilter, setComplexityFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy] = useState<SortCol>('days_remaining')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => { setTasks(initialTasks) }, [initialTasks])
  useEffect(() => { setPage(1) }, [search, typeFilter, complexityFilter, ownerFilter, pageSize, searchParams])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: 'DELETE', schema: 'Marketing-PM-Tool', table: 'tasks' }, payload => {
        setTasks(prev => prev.filter(t => t.id !== (payload.old as { id: string }).id))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'Marketing-PM-Tool', table: 'tasks' }, payload => {
        setTasks(prev => prev.map(t => t.id === (payload.new as Task).id ? payload.new as Task : t))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const monthFilter = searchParams.get('month')
  const yearFilter  = searchParams.get('year')

  // Map of parent_task_id -> children[], built from the full unfiltered task list
  const childrenMap = useMemo(() => {
    const map: Record<string, Task[]> = {}
    tasks.forEach(t => {
      if (t.parent_task_id) {
        if (!map[t.parent_task_id]) map[t.parent_task_id] = []
        map[t.parent_task_id].push(t)
      }
    })
    return map
  }, [tasks])

  const allTaskIds = useMemo(() => new Set(tasks.map(t => t.id)), [tasks])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter(t => {
      if (q && !(
        t.title.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q) ||
        (t.category ?? '').toLowerCase().includes(q)
      )) return false
      if (ownerFilter && t.user_id !== ownerFilter) return false
      if (typeFilter && t.task_type !== typeFilter) return false
      if (complexityFilter && t.complexity !== complexityFilter) return false
      if (monthFilter && yearFilter) {
        const m = parseInt(monthFilter), y = parseInt(yearFilter)
        const due = t.due_date ? new Date(t.due_date) : null
        const created = new Date(t.created_at)
        const matchesDue = due && due.getUTCMonth() + 1 === m && due.getUTCFullYear() === y
        const matchesCreated = !due && created.getMonth() + 1 === m && created.getFullYear() === y
        if (!matchesDue && !matchesCreated) return false
      }
      return true
    })
  }, [tasks, search, typeFilter, complexityFilter, ownerFilter, monthFilter, yearFilter])

  // Only top-level tasks go into the paginated list.
  // A child whose parent isn't in the list shows as top-level (orphaned dependency).
  const topLevel = useMemo(
    () => filtered.filter(t => !t.parent_task_id || !allTaskIds.has(t.parent_task_id)),
    [filtered, allTaskIds]
  )

  function handleSort(col: SortCol) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
    setPage(1)
  }

  // Sort top-level tasks; nulls (no due date) always last
  const sortedTopLevel = useMemo(() => {
    return [...topLevel].sort((a, b) => {
      const dA = getDaysRemaining(a.due_date)
      const dB = getDaysRemaining(b.due_date)
      if (dA === null && dB === null) return 0
      if (dA === null) return 1
      if (dB === null) return -1
      return sortDir === 'asc' ? dA - dB : dB - dA
    })
  }, [topLevel, sortBy, sortDir])

  const ownerOptions = useMemo(() => {
    const seen = new Set<string>()
    const opts: { id: string; name: string }[] = []
    tasks.forEach(t => {
      if (!seen.has(t.user_id)) {
        seen.add(t.user_id)
        opts.push({ id: t.user_id, name: profileMap[t.user_id]?.full_name ?? t.user_id })
      }
    })
    return opts.sort((a, b) => a.name.localeCompare(b.name))
  }, [tasks, profileMap])

  const totalPages = Math.max(1, Math.ceil(sortedTopLevel.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = sortedTopLevel.slice((safePage - 1) * pageSize, safePage * pageSize)

  async function handleStatusChange(id: string, status: string) {
    setUpdatingStatus(id)
    const res = await fetch(`/api/tasks/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setUpdatingStatus(null)
    if (res.ok) {
      const updated = await res.json()
      setTasks(prev => prev.map(t => t.id === id ? updated : t))
      router.refresh()
    } else {
      const data = await res.json()
      alert(data.error ?? 'Failed to update status')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this task? This cannot be undone.')) return
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    if (res.ok) setTasks(prev => prev.filter(t => t.id !== id))
    else { const data = await res.json(); alert(data.error ?? 'Failed to delete task') }
  }

  function renderTaskRow(task: Task, isChild = false) {
    const overdue    = isOverdue(task.due_date, task.status)
    const children   = childrenMap[task.id] ?? []
    const hasChildren = !isChild && children.length > 0
    const isExpanded = expanded.has(task.id)
    const approval   = approvalCell(task)
    const doneAndConfirmed = task.status === 'done' && task.approval_status === 'approved'

    return (
      <tr
        key={task.id}
        className={cn(
          'transition-colors',
          isChild
            ? 'bg-purple-50/40 hover:bg-purple-50/70'
            : 'hover:bg-gray-50'
        )}
      >
        {/* Task title */}
        <td className={cn('py-3 px-4', isChild ? 'max-w-xs' : 'max-w-xs')}>
          <div className={cn('flex items-start gap-2', isChild && 'pl-6 relative')}>
            {/* Tree connector line for child rows */}
            {isChild && (
              <div className="absolute left-0 top-0 bottom-0 flex flex-col items-center w-5 pointer-events-none select-none">
                <div className="w-px bg-purple-200 flex-1 mt-1" />
                <div className="w-3 h-px bg-purple-200 absolute top-5" />
              </div>
            )}

            {/* Expand toggle for parent tasks */}
            {hasChildren && (
              <button
                onClick={() => toggleExpand(task.id)}
                className="mt-0.5 flex-shrink-0 p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <ChevronRight
                  size={14}
                  className={cn('transition-transform duration-150', isExpanded && 'rotate-90')}
                />
              </button>
            )}
            {!hasChildren && !isChild && <div className="w-5 flex-shrink-0" />}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <Link
                  href={`/tasks/${task.id}`}
                  className={cn(
                    'text-sm font-medium hover:text-blue-600 line-clamp-1',
                    isChild ? 'text-gray-700' : 'text-gray-900'
                  )}
                >
                  {task.title}
                </Link>

                {/* Dependency badge on child rows */}
                {isChild && (
                  <span className="flex items-center gap-0.5 text-[9px] font-black bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded uppercase tracking-tighter shrink-0">
                    <LinkIcon size={8} /> Dep
                  </span>
                )}

                {/* Deps count badge on parent rows */}
                {hasChildren && (
                  <button
                    onClick={() => toggleExpand(task.id)}
                    className={cn(
                      'flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 transition-colors',
                      isExpanded
                        ? 'bg-purple-200 text-purple-700'
                        : 'bg-purple-100 text-purple-600 hover:bg-purple-200'
                    )}
                  >
                    <LinkIcon size={9} />
                    {children.length} dep{children.length !== 1 ? 's' : ''}
                    <ChevronDown size={9} className={cn('transition-transform duration-150', isExpanded && 'rotate-180')} />
                  </button>
                )}
              </div>

              {task.description && (
                <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{stripHtml(task.description)}</p>
              )}
            </div>
          </div>
        </td>

        {/* Owner */}
        <td className="py-3 px-4">
          <OwnerCell userId={task.user_id} profileMap={profileMap} />
        </td>

        {/* Status */}
        <td className="py-3 px-4">
          {(() => {
            const canEditStatus = isAdmin || (currentUserId && task.user_id === currentUserId)
            const lockedForApproval = task.approval_status === 'pending_approval'
            const disabled = !canEditStatus || lockedForApproval || updatingStatus === task.id

            if (!canEditStatus) {
              return (
                <span
                  title="Only the assignee can change this task's status."
                  className={cn('text-xs font-medium px-2 py-1 rounded-full inline-block', statusStyles[task.status])}
                >
                  {statusLabels[task.status]}
                </span>
              )
            }

            return (
              <select
                value={task.status}
                disabled={disabled}
                onChange={e => handleStatusChange(task.id, e.target.value)}
                className={cn(
                  'text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400',
                  statusStyles[task.status],
                  disabled && 'cursor-default opacity-80',
                )}
              >
                {Object.entries(statusLabels).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            )
          })()}
        </td>

        {/* Priority */}
        <td className="py-3 px-4">
          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', priorityStyles[task.priority])}>
            {task.priority}
          </span>
        </td>

        {/* Category */}
        <td className="py-3 px-4 text-sm text-gray-600 capitalize">
          {task.category ?? <span className="text-gray-300">—</span>}
        </td>

        {/* Due Date */}
        <td className="py-3 px-4">
          {task.due_date ? (
            <span className={cn('text-sm', overdue ? 'text-red-600 font-medium' : 'text-gray-600')}>
              {formatDate(task.due_date)}{overdue ? ' ⚠' : ''}
            </span>
          ) : (
            <span className="text-gray-300 text-sm">—</span>
          )}
        </td>

        {/* Days Remaining */}
        <td className="py-3 px-4">
          <DaysRemainingCell dueDate={task.due_date} status={task.status} />
        </td>

        {/* Score */}
        <td className="py-3 px-4"><ScoreCell task={task} /></td>

        {/* Approval */}
        <td className="py-3 px-4">
          {approval
            ? <span className={cn('text-xs font-medium', approval.cls)}>{approval.label}</span>
            : <span className="text-gray-300 text-xs">—</span>
          }
        </td>

        {/* Actions */}
        <td className="py-3 px-4">
          <div className="flex items-center gap-1 justify-end">
            {!doneAndConfirmed && (
              <Link
                href={`/tasks/${task.id}/edit`}
                title="Edit task"
                className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
              >
                <Pencil size={13} />
              </Link>
            )}
            <Link
              href={`/tasks/${task.id}`}
              title="View details"
              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ExternalLink size={13} />
            </Link>
            {isAdmin && (
              <button
                onClick={() => handleDelete(task.id)}
                title="Delete task"
                className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative min-w-48 max-w-sm flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )}
          </div>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
          >
            <option value="">All Types</option>
            <option value="monthly_task">🔁 Monthly Task</option>
            <option value="new_implementation">🚀 New Implementation</option>
            <option value="ai">🤖 AI</option>
          </select>
          <select
            value={complexityFilter}
            onChange={e => setComplexityFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
          >
            <option value="">All Complexities</option>
            <option value="easy">🟢 Easy</option>
            <option value="medium">🟡 Medium</option>
            <option value="difficult">🔴 Difficult</option>
          </select>
          {ownerOptions.length > 1 && (
            <select
              value={ownerFilter}
              onChange={e => setOwnerFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
            >
              <option value="">All Owners</option>
              {ownerOptions.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          )}
          {(typeFilter || complexityFilter || ownerFilter) && (
            <button
              onClick={() => { setTypeFilter(''); setComplexityFilter(''); setOwnerFilter('') }}
              className="text-xs text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {topLevel.length} task{topLevel.length !== 1 ? 's' : ''}
          {filtered.length !== topLevel.length && ` · ${filtered.length - topLevel.length} dep${filtered.length - topLevel.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Early-bonus summary */}
      {(() => {
        const scoredDone  = filtered.filter(t => t.status === 'done' && t.score_weight > 0)
        const totalPot    = Math.round(scoredDone.reduce((s, t) => s + t.score_weight, 0) * 100) / 100
        const totalEarned = Math.round(scoredDone.reduce((s, t) => s + t.score_earned, 0) * 100) / 100
        const bonusTasks  = scoredDone.filter(t => t.score_earned > t.score_weight)
        if (bonusTasks.length === 0) return null
        const bonusEarned = Math.round((totalEarned - totalPot) * 100) / 100
        return (
          <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm">
            <Zap size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-green-800">
                You earned {totalEarned} pts from {scoredDone.length} completed task{scoredDone.length !== 1 ? 's' : ''} — {bonusEarned > 0 ? `+${bonusEarned} pts` : ''} above potential.
              </span>
              <span className="text-green-700 ml-1">
                {bonusTasks.length} task{bonusTasks.length !== 1 ? 's were' : ' was'} closed before the deadline, earning a ×1.5 early-completion bonus. Your potential was {totalPot} pts.
              </span>
            </div>
            <Info size={14} className="text-green-500 flex-shrink-0 mt-0.5 ml-auto" />
          </div>
        )
      })()}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {paginated.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="font-medium">{search ? 'No tasks match your search' : 'No tasks found'}</p>
            {search && <button onClick={() => setSearch('')} className="text-sm text-blue-600 hover:underline mt-1">Clear search</button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left py-3 px-4 font-medium">Task</th>
                  <th className="text-left py-3 px-4 font-medium">Owner</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium">Priority</th>
                  <th className="text-left py-3 px-4 font-medium">Category</th>
                  <th className="text-left py-3 px-4 font-medium">
                    <button
                      onClick={() => handleSort('due_date')}
                      className="flex items-center gap-1 hover:text-gray-800 transition-colors group"
                    >
                      Due Date
                      {sortBy === 'due_date'
                        ? sortDir === 'asc' ? <ArrowUp size={12} className="text-blue-500" /> : <ArrowDown size={12} className="text-blue-500" />
                        : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-60" />}
                    </button>
                  </th>
                  <th className="text-left py-3 px-4 font-medium">
                    <button
                      onClick={() => handleSort('days_remaining')}
                      className="flex items-center gap-1 hover:text-gray-800 transition-colors group whitespace-nowrap"
                    >
                      Days Left
                      {sortBy === 'days_remaining'
                        ? sortDir === 'asc' ? <ArrowUp size={12} className="text-blue-500" /> : <ArrowDown size={12} className="text-blue-500" />
                        : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-60" />}
                    </button>
                  </th>
                  <th className="text-left py-3 px-4 font-medium">Score</th>
                  <th className="text-left py-3 px-4 font-medium">Approval</th>
                  <th className="py-3 px-4 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.map(task => {
                  const children  = childrenMap[task.id] ?? []
                  const isExpanded = expanded.has(task.id)
                  return (
                    <>
                      {renderTaskRow(task, false)}
                      {isExpanded && children.map(child => renderTaskRow(child, true))}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {(totalPages > 1 || sortedTopLevel.length > PAGE_SIZES[0]) && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-500">
                Showing {((safePage - 1) * pageSize) + 1}–{Math.min(safePage * pageSize, sortedTopLevel.length)} of {sortedTopLevel.length}
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">Rows:</span>
                {PAGE_SIZES.map(s => (
                  <button
                    key={s}
                    onClick={() => setPageSize(s)}
                    className={cn(
                      'text-xs px-2 py-0.5 rounded font-medium transition-colors',
                      pageSize === s ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-200'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="p-1.5 rounded hover:bg-gray-200 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={15} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...')
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={cn(
                        'w-7 h-7 text-xs rounded font-medium transition-colors',
                        safePage === p ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200'
                      )}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="p-1.5 rounded hover:bg-gray-200 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
