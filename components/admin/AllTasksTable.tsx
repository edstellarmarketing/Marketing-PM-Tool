'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, Trash2, X, AlertTriangle, ChevronDown, Filter, Users, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UserProfile {
  id: string
  full_name: string
  avatar_url: string | null
  department: string | null
  role: string
}

interface Task {
  id: string
  user_id: string
  title: string
  description: string | null
  status: string
  priority: string
  category: string | null
  task_type: string | null
  complexity: string | null
  start_date: string | null
  due_date: string | null
  completion_date: string | null
  score_weight: number
  score_earned: number
  approval_status: string
  created_at: string
}

const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
  blocked: 'Blocked',
}

const STATUS_CLS: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  review: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  done: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  blocked: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
}

const PRIORITY_CLS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  medium: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
  high: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isOverdue(due: string | null, status: string) {
  if (!due || status === 'done') return false
  return new Date(due) < new Date()
}

export default function AllTasksTable() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<{ mode: 'single' | 'bulk'; taskId?: string; count?: number } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/tasks').then(r => r.json()),
      fetch('/api/admin/users').then(r => r.json()),
    ]).then(([t, u]) => {
      if (Array.isArray(t)) setTasks(t)
      if (Array.isArray(u)) setUsers(u)
    }).finally(() => setLoading(false))
  }, [])

  const userMap = useMemo(() => {
    const m = new Map<string, UserProfile>()
    users.forEach(u => m.set(u.id, u))
    return m
  }, [users])

  const departments = useMemo(() => {
    const depts = new Set<string>()
    users.forEach(u => { if (u.department) depts.add(u.department) })
    return Array.from(depts).sort()
  }, [users])

  const memberUsers = useMemo(() => users.filter(u => u.role === 'member'), [users])

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      const user = userMap.get(t.user_id)
      if (filterUser && t.user_id !== filterUser) return false
      if (filterDept && user?.department !== filterDept) return false
      if (filterStatus && t.status !== filterStatus) return false
      if (filterPriority && t.priority !== filterPriority) return false
      if (search) {
        const q = search.toLowerCase()
        const matchTitle = t.title.toLowerCase().includes(q)
        const matchUser = user?.full_name.toLowerCase().includes(q) ?? false
        const matchCat = t.category?.toLowerCase().includes(q) ?? false
        if (!matchTitle && !matchUser && !matchCat) return false
      }
      return true
    })
  }, [tasks, userMap, filterUser, filterDept, filterStatus, filterPriority, search])

  const allSelected = filtered.length > 0 && filtered.every(t => selected.has(t.id))
  const someSelected = selected.size > 0

  function toggleAll() {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        filtered.forEach(t => next.delete(t.id))
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        filtered.forEach(t => next.add(t.id))
        return next
      })
    }
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function clearFilters() {
    setSearch('')
    setFilterUser('')
    setFilterDept('')
    setFilterStatus('')
    setFilterPriority('')
  }

  const hasFilters = search || filterUser || filterDept || filterStatus || filterPriority

  async function doDelete(ids: string[]) {
    setDeleting(true)
    setDeleteError(null)
    try {
      const results = await Promise.all(
        ids.map(id => fetch(`/api/tasks/${id}`, { method: 'DELETE' }).then(r => ({ id, ok: r.ok })))
      )
      const failed = results.filter(r => !r.ok)
      if (failed.length > 0) {
        setDeleteError(`${failed.length} task(s) could not be deleted.`)
        const deleted = results.filter(r => r.ok).map(r => r.id)
        setTasks(prev => prev.filter(t => !deleted.includes(t.id)))
        setSelected(prev => { const n = new Set(prev); deleted.forEach(id => n.delete(id)); return n })
      } else {
        setTasks(prev => prev.filter(t => !ids.includes(t.id)))
        setSelected(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n })
        setConfirmDelete(null)
      }
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">All Tasks</h1>
          <span className="text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2.5 py-1 rounded-full">
            {filtered.length} / {tasks.length}
          </span>
        </div>
        {someSelected && (
          <button
            onClick={() => setConfirmDelete({ mode: 'bulk', count: selected.size })}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
          >
            <Trash2 size={14} />
            Delete {selected.size} selected
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks, users…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* User filter */}
          <div className="relative">
            <Users size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select
              value={filterUser}
              onChange={e => { setFilterUser(e.target.value); setFilterDept('') }}
              className="w-full appearance-none pl-8 pr-7 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Users</option>
              {memberUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Department filter */}
          <div className="relative">
            <Building2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select
              value={filterDept}
              onChange={e => { setFilterDept(e.target.value); setFilterUser('') }}
              className="w-full appearance-none pl-8 pr-7 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Status filter */}
          <div className="relative">
            <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full appearance-none pl-8 pr-7 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Priority pills + clear */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Priority:</span>
          {['', 'low', 'medium', 'high', 'critical'].map(p => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full font-medium transition-colors',
                filterPriority === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
            >
              {p === '' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium"
            >
              <X size={12} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search size={32} className="text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No tasks found</p>
            {hasFilters && (
              <button onClick={clearFilters} className="mt-2 text-xs text-blue-600 hover:underline">Clear filters</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">Task</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">Assigned To</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">Department</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">Priority</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">Due Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">Created</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {filtered.map(task => {
                  const user = userMap.get(task.user_id)
                  const overdue = isOverdue(task.due_date, task.status)
                  const isChecked = selected.has(task.id)

                  return (
                    <tr
                      key={task.id}
                      className={cn(
                        'hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors',
                        isChecked && 'bg-blue-50/50 dark:bg-blue-900/10'
                      )}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOne(task.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>

                      {/* Task title */}
                      <td className="px-4 py-3 max-w-xs">
                        <p className="font-medium text-gray-900 dark:text-white truncate">{task.title}</p>
                        {task.category && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">{task.category}</span>
                        )}
                      </td>

                      {/* User */}
                      <td className="px-4 py-3">
                        {user ? (
                          <div className="flex items-center gap-2">
                            {user.avatar_url ? (
                              <img src={user.avatar_url} alt={user.full_name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                                {initials(user.full_name)}
                              </div>
                            )}
                            <span className="text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap">{user.full_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Unknown</span>
                        )}
                      </td>

                      {/* Department */}
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {user?.department ?? '—'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', STATUS_CLS[task.status] ?? STATUS_CLS.todo)}>
                          {STATUS_LABELS[task.status] ?? task.status}
                        </span>
                      </td>

                      {/* Priority */}
                      <td className="px-4 py-3">
                        <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full capitalize', PRIORITY_CLS[task.priority] ?? PRIORITY_CLS.medium)}>
                          {task.priority}
                        </span>
                      </td>

                      {/* Due date */}
                      <td className="px-4 py-3">
                        <span className={cn('text-sm whitespace-nowrap', overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-600 dark:text-gray-400')}>
                          {formatDate(task.due_date)}
                          {overdue && <span className="ml-1 text-xs">(overdue)</span>}
                        </span>
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-500 dark:text-gray-500 whitespace-nowrap">
                          {formatDate(task.created_at)}
                        </span>
                      </td>

                      {/* Delete */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setConfirmDelete({ mode: 'single', taskId: task.id })}
                          className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Delete task permanently"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  {confirmDelete.mode === 'bulk'
                    ? `Delete ${confirmDelete.count} tasks?`
                    : 'Delete this task?'}
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {confirmDelete.mode === 'bulk'
                    ? `This will permanently delete ${confirmDelete.count} tasks from the database. This action cannot be undone.`
                    : 'This will permanently delete the task and all its data from the database. This action cannot be undone.'}
                </p>
                {deleteError && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                    {deleteError}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6 justify-end">
              <button
                onClick={() => { setConfirmDelete(null); setDeleteError(null) }}
                disabled={deleting}
                className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const ids = confirmDelete.mode === 'bulk'
                    ? Array.from(selected)
                    : [confirmDelete.taskId!]
                  doDelete(ids)
                }}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    {confirmDelete.mode === 'bulk' ? `Delete ${confirmDelete.count} tasks` : 'Delete task'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
