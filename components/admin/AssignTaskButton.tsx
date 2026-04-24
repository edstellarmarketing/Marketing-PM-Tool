'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, UserCheck, CheckSquare, Trash2, GripVertical, ChevronDown } from 'lucide-react'
import ScoringClassification from '@/components/tasks/ScoringClassification'
import { computeScorePreview } from '@/lib/scoring'
import type { SubTask, TaskType, Complexity, PointConfig } from '@/types'

const priorities = ['low', 'medium', 'high', 'critical']

interface MemberUser {
  id: string
  full_name: string
  avatar_url?: string | null
}

function newSubTask(): SubTask {
  return { id: crypto.randomUUID(), title: '', completed: false }
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function computePreview(configs: PointConfig[], taskType: TaskType | '', complexity: Complexity | '', subtaskCount = 0) {
  return computeScorePreview(configs, taskType, complexity, subtaskCount)
}

export default function AssignTaskButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
      >
        <Plus size={14} />
        Assign Task
      </button>

      {open && <AssignTaskModal onClose={() => setOpen(false)} />}
    </>
  )
}

function AssignTaskModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const backdropRef = useRef<HTMLDivElement>(null)

  const [users, setUsers] = useState<MemberUser[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [configs, setConfigs] = useState<PointConfig[]>([])
  const [loadingData, setLoadingData] = useState(true)

  const [selectedUserId, setSelectedUserId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    priority: 'medium',
    task_type: '' as TaskType | '',
    complexity: '' as Complexity | '',
    start_date: '',
    due_date: '',
  })

  const [subtasks, setSubtasks] = useState<SubTask[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/api/profiles/active').then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/point-config').then(r => r.json()),
    ]).then(([u, c, p]) => {
      if (Array.isArray(u)) setUsers(u)
      if (Array.isArray(c)) setCategories(c.map((x: { name: string }) => x.name))
      if (Array.isArray(p)) setConfigs(p)
    }).finally(() => setLoadingData(false))
  }, [])

  function setField(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function addSubTask() { setSubtasks(prev => [...prev, newSubTask()]) }
  function updateSubTask(id: string, title: string) { setSubtasks(prev => prev.map(s => s.id === id ? { ...s, title } : s)) }
  function removeSubTask(id: string) { setSubtasks(prev => prev.filter(s => s.id !== id)) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUserId) { setError('Please select a member to assign this task to.'); return }
    setError(null)
    setLoading(true)

    const validSubtasks = subtasks.filter(s => s.title.trim())
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        user_id: selectedUserId,
        task_type: form.task_type || undefined,
        complexity: form.complexity || undefined,
        start_date: form.start_date || undefined,
        due_date: form.due_date || undefined,
        category: form.category || undefined,
        subtasks: validSubtasks.length > 0 ? validSubtasks : undefined,
      }),
    })

    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error?.formErrors?.[0] ?? data.error ?? 'Failed to assign task')
      return
    }

    onClose()
    router.refresh()
  }

  const selectedUser = users.find(u => u.id === selectedUserId)
  const validSubtaskCount = subtasks.filter(s => s.title.trim()).length
  const preview = computePreview(configs, form.task_type, form.complexity, validSubtaskCount)

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose()
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <UserCheck size={18} className="text-blue-500" />
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Assign New Task</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {loadingData ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <form id="assign-task-form" onSubmit={handleSubmit} className="space-y-5">
              {/* Member selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Assign To <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedUserId}
                    onChange={e => setSelectedUserId(e.target.value)}
                    className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="">Select a member…</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                {selectedUser && (
                  <div className="flex items-center gap-2 mt-2">
                    {selectedUser.avatar_url ? (
                      <img src={selectedUser.avatar_url} alt={selectedUser.full_name} className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                        {initials(selectedUser.full_name)}
                      </div>
                    )}
                    <span className="text-xs text-gray-600 dark:text-gray-400">Assigning to <span className="font-semibold text-gray-800 dark:text-gray-200">{selectedUser.full_name}</span></span>
                  </div>
                )}
              </div>

              {/* Task name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Task Name <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={form.title}
                  onChange={e => setField('title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400"
                  placeholder="Enter task name"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={e => setField('description', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400"
                  placeholder="What needs to be done?"
                />
              </div>

              {/* Scoring Classification */}
              <ScoringClassification
                configs={configs}
                taskType={form.task_type}
                complexity={form.complexity}
                onTypeChange={v => setField('task_type', v)}
                onComplexityChange={v => setField('complexity', v)}
                preview={preview}
              />

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={e => setField('start_date', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={form.due_date}
                    onChange={e => setField('due_date', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Sub-tasks */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CheckSquare size={16} className="text-gray-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Sub-tasks / Checklist</span>
                    {subtasks.length > 0 && (
                      <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">{subtasks.length}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={addSubTask}
                    className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                  >
                    <Plus size={14} /> Add item
                  </button>
                </div>

                {subtasks.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">No sub-tasks added yet.</p>
                ) : (
                  <div className="space-y-2">
                    {subtasks.map((s, i) => (
                      <div key={s.id} className="flex items-center gap-2 group">
                        <GripVertical size={14} className="text-gray-300 flex-shrink-0" />
                        <span className="text-xs text-gray-400 w-5 flex-shrink-0">{i + 1}.</span>
                        <input
                          type="text"
                          value={s.title}
                          onChange={e => updateSubTask(s.id, e.target.value)}
                          placeholder="Sub-task description"
                          className="flex-1 px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => removeSubTask(s.id)}
                          className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Category + Priority */}
              <div className="border-t border-gray-100 dark:border-gray-800 pt-5 space-y-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Additional Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                    <select
                      value={form.category}
                      onChange={e => setField('category', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    >
                      <option value="">Select category</option>
                      {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
                    <select
                      value={form.priority}
                      onChange={e => setField('priority', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    >
                      {priorities.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</p>
              )}
            </form>
          )}
        </div>

        {/* Footer actions */}
        {!loadingData && (
          <div className="flex gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
            <button
              type="submit"
              form="assign-task-form"
              disabled={loading}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Assigning…' : selectedUser ? `Assign to ${selectedUser.full_name.split(' ')[0]}` : 'Assign Task'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
