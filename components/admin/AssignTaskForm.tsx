'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, GripVertical, CheckSquare, UserCheck } from 'lucide-react'
import ScoringClassification from '@/components/tasks/ScoringClassification'
import { computeScorePreview } from '@/lib/scoring'
import type { SubTask, TaskType, Complexity, PointConfig } from '@/types'

const priorities = ['low', 'medium', 'high', 'critical']

interface Props {
  targetUserId: string
  targetUserName: string
  targetUserAvatar: string | null
  categories: string[]
}

function newSubTask(): SubTask {
  return { id: crypto.randomUUID(), title: '', completed: false }
}

function computePreview(configs: PointConfig[], taskType: TaskType | '', complexity: Complexity | '', subtaskCount = 0) {
  return computeScorePreview(configs, taskType, complexity, subtaskCount)
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function AssignTaskForm({ targetUserId, targetUserName, targetUserAvatar, categories }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configs, setConfigs] = useState<PointConfig[]>([])

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
    fetch('/api/point-config')
      .then(r => r.json())
      .then(d => Array.isArray(d) && setConfigs(d))
      .catch(() => {})
  }, [])

  function setField(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function addSubTask() { setSubtasks(prev => [...prev, newSubTask()]) }
  function updateSubTask(id: string, title: string) { setSubtasks(prev => prev.map(s => s.id === id ? { ...s, title } : s)) }
  function removeSubTask(id: string) { setSubtasks(prev => prev.filter(s => s.id !== id)) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const validSubtasks = subtasks.filter(s => s.title.trim())
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        user_id: targetUserId,
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
    router.push(`/admin/users/${targetUserId}`)
    router.refresh()
  }

  const validSubtaskCount = subtasks.filter(s => s.title.trim()).length
  const preview = computePreview(configs, form.task_type, form.complexity, validSubtaskCount)

  return (
    <div className="max-w-2xl mx-auto">
      <Link href={`/admin/users/${targetUserId}`} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <ArrowLeft size={16} /> Back to User
      </Link>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
          <UserCheck size={20} className="text-blue-500 flex-shrink-0" />
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">Assign New Task</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-500">Assigning to:</span>
              {targetUserAvatar ? (
                <img src={targetUserAvatar} alt={targetUserName} className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[8px] font-bold">
                  {initials(targetUserName)}
                </div>
              )}
              <span className="text-sm font-semibold text-gray-800">{targetUserName}</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Task name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Task Name <span className="text-red-500">*</span></label>
            <input
              required
              type="text"
              value={form.title}
              onChange={e => setField('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter task name"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setField('start_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => setField('due_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Sub-tasks */}
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckSquare size={16} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Sub-tasks / Checklist</span>
                {subtasks.length > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{subtasks.length}</span>
                )}
              </div>
              <button
                type="button"
                onClick={addSubTask}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
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
                      className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <div className="border-t border-gray-100 pt-5 space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Additional Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={e => setField('category', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={form.priority}
                  onChange={e => setField('priority', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {priorities.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Assigning…' : `Assign to ${targetUserName.split(' ')[0]}`}
            </button>
            <Link
              href={`/admin/users/${targetUserId}`}
              className="px-6 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
