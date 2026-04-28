'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import type { Task } from '@/types'
import { stripHtml } from '@/lib/utils'

type PendingTask = Task & { profiles: { full_name: string; avatar_url: string | null } }

function groupByUser(tasks: PendingTask[]): Record<string, PendingTask[]> {
  return tasks.reduce((acc, t) => {
    const name = t.profiles?.full_name ?? t.user_id
    if (!acc[name]) acc[name] = []
    acc[name].push(t)
    return acc
  }, {} as Record<string, PendingTask[]>)
}

export default function PendingApprovalsPanel() {
  const [tasks, setTasks] = useState<PendingTask[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [noteMap, setNoteMap] = useState<Record<string, string>>({})
  const [processing, setProcessing] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetch('/api/admin/tasks/pending')
      .then(r => r.json())
      .then(data => { setTasks(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const grouped = groupByUser(tasks)
  const userNames = Object.keys(grouped)

  function toggleTask(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleUserAll(name: string) {
    const ids = grouped[name].map(t => t.id)
    const allSelected = ids.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(tasks.map(t => t.id)))
  }

  function clearAll() {
    setSelected(new Set())
  }

  async function applyAction(ids: string[], action: 'approved' | 'rejected') {
    setProcessing(true)
    await Promise.all(ids.map(id =>
      fetch(`/api/admin/tasks/${id}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: noteMap[id] ?? '' }),
      })
    ))
    setTasks(prev => prev.filter(t => !ids.includes(t.id)))
    setSelected(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next })
    setProcessing(false)
  }

  if (loading) return <div className="text-sm text-gray-400 py-4">Loading pending completion approvals…</div>
  if (tasks.length === 0) return <div className="text-sm text-gray-400 py-4 text-center">No completions pending approval. ✓</div>

  const selectedArr = Array.from(selected)

  return (
    <div className="space-y-4">
      {/* Bulk action bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{tasks.length} task{tasks.length !== 1 ? 's' : ''} from {userNames.length} member{userNames.length !== 1 ? 's' : ''}</span>
          <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">Select all</button>
          {selected.size > 0 && <button onClick={clearAll} className="text-xs text-gray-400 hover:underline">Clear</button>}
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">{selected.size} selected</span>
            <button
              onClick={() => applyAction(selectedArr, 'approved')}
              disabled={processing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg"
            >
              <CheckCircle size={13} /> Confirm scores
            </button>
            <button
              onClick={() => applyAction(selectedArr, 'rejected')}
              disabled={processing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-700 text-xs font-medium rounded-lg"
            >
              <XCircle size={13} /> Return to In Progress
            </button>
          </div>
        )}
      </div>

      {/* Per-user groups */}
      {userNames.map(name => {
        const userTasks = grouped[name]
        const allSelected = userTasks.every(t => selected.has(t.id))
        const someSelected = userTasks.some(t => selected.has(t.id))
        const isCollapsed = collapsed[name]

        return (
          <div key={name} className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Group header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
              <input
                type="checkbox"
                checked={allSelected}
                ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                onChange={() => toggleUserAll(name)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
              />
              <span className="font-medium text-gray-800 flex-1">{name}</span>
              <span className="text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">
                {userTasks.length} task{userTasks.length !== 1 ? 's' : ''}
              </span>
              {userTasks.every(t => selected.has(t.id)) && userTasks.length > 0 && (
                <button
                  onClick={() => applyAction(userTasks.map(t => t.id), 'approved')}
                  disabled={processing}
                  className="flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg"
                >
                  <CheckCircle size={12} /> Confirm all
                </button>
              )}
              <button onClick={() => setCollapsed(prev => ({ ...prev, [name]: !prev[name] }))} className="text-gray-400 hover:text-gray-600">
                {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            </div>

            {/* Tasks */}
            {!isCollapsed && (
              <div className="divide-y divide-gray-100">
                {userTasks.map(task => (
                  <div key={task.id} className={`px-4 py-3 ${selected.has(task.id) ? 'bg-blue-50' : 'bg-white'}`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(task.id)}
                        onChange={() => toggleTask(task.id)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm">{task.title}</p>
                        {task.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{stripHtml(task.description)}</p>
                        )}
                        <div className="flex gap-2 mt-1.5 flex-wrap items-center">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{task.priority}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{task.status.replace('_', ' ')}</span>
                          {task.category && <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{task.category}</span>}
                          {task.task_type && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                              {task.task_type === 'monthly_task' ? '🔁 Monthly' : task.task_type === 'new_implementation' ? '🚀 New Impl.' : '🤖 AI'}
                            </span>
                          )}
                          {task.complexity && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium capitalize">
                              {task.complexity}
                            </span>
                          )}
                          {task.score_weight > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500">
                              ⚡ {Math.round(task.score_weight * 100) / 100} pts
                            </span>
                          )}
                          {task.due_date && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              📅 Due: {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder="Optional note…"
                          value={noteMap[task.id] ?? ''}
                          onChange={e => setNoteMap(prev => ({ ...prev, [task.id]: e.target.value }))}
                          className="mt-2 w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => applyAction([task.id], 'approved')}
                          disabled={processing}
                          className="flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg"
                        >
                          <CheckCircle size={12} /> Confirm
                        </button>
                        <button
                          onClick={() => applyAction([task.id], 'rejected')}
                          disabled={processing}
                          className="flex items-center gap-1 px-2.5 py-1 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-700 text-xs font-medium rounded-lg"
                          title="Reject completion — reverts task to In Progress"
                        >
                          <XCircle size={12} /> Return
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
