'use client'

import { useState } from 'react'
import { X, Zap } from 'lucide-react'
import type { Task, TaskType, Complexity } from '@/types'

const taskTypeOptions: { value: TaskType; label: string; icon: string }[] = [
  { value: 'monthly_task',       label: 'Monthly Task',       icon: '🔁' },
  { value: 'new_implementation', label: 'New Implementation', icon: '🚀' },
  { value: 'ai',                 label: 'AI',                 icon: '🤖' },
]

const complexityOptions: { value: Complexity; label: string; icon: string }[] = [
  { value: 'easy',      label: 'Easy',      icon: '🟢' },
  { value: 'medium',    label: 'Medium',    icon: '🟡' },
  { value: 'difficult', label: 'Difficult', icon: '🔴' },
]

interface Props {
  task: Task
  onClose: () => void
  onSaved: (updated: Task) => void
}

export default function EditTaskModal({ task, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [category, setCategory] = useState(task.category ?? '')
  const [priority, setPriority] = useState(task.priority)
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [taskType, setTaskType] = useState<TaskType | null>(task.task_type)
  const [complexity, setComplexity] = useState<Complexity | null>(task.complexity)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scoringLocked = task.status === 'done'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: description || null,
        category: category || null,
        priority,
        due_date: dueDate || null,
        // Never send task_type/complexity for done tasks — scoring is locked
        ...(!scoringLocked && { task_type: taskType, complexity }),
      }),
    })

    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to update task')
      return
    }

    const updated = await res.json()
    onSaved(updated)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Edit Task</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Task Type */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Task Type</label>
              {scoringLocked && <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">🔒 Locked after completion</span>}
            </div>
            {scoringLocked ? (
              <div className="flex gap-2">
                {taskTypeOptions.map(opt => (
                  <div
                    key={opt.value}
                    className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-center opacity-60 cursor-not-allowed ${
                      taskType === opt.value ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <span className="text-base">{opt.icon}</span>
                    <span className="text-[10px] font-semibold text-gray-500 leading-tight">{opt.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex gap-2">
                {taskTypeOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTaskType(opt.value)}
                    className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-center transition-all ${
                      taskType === opt.value
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500 ring-offset-1'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <span className="text-base">{opt.icon}</span>
                    <span className="text-[10px] font-semibold text-gray-700 leading-tight">{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Complexity */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Complexity</label>
            {scoringLocked ? (
              <div className="flex gap-2">
                {complexityOptions.map(opt => (
                  <div
                    key={opt.value}
                    className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-center opacity-60 cursor-not-allowed ${
                      complexity === opt.value ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <span className="text-base">{opt.icon}</span>
                    <span className="text-[10px] font-semibold text-gray-500">{opt.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex gap-2">
                {complexityOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setComplexity(opt.value)}
                    className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg border text-center transition-all ${
                      complexity === opt.value
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500 ring-offset-1'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <span className="text-base">{opt.icon}</span>
                    <span className="text-[10px] font-semibold text-gray-700">{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Score preview (read-only) */}
          {task.score_weight > 0 && (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <Zap size={14} className="text-blue-500" />
              <span className="text-xs text-gray-600">
                Current potential: <strong>{task.score_weight} pts</strong>
                {task.status === 'done' && <> · Earned: <strong className="text-green-600">{task.score_earned} pts</strong></>}
              </span>
              <span className="text-[10px] text-gray-400 ml-auto">Auto-calculated</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as Task['priority'])}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <input
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="e.g. SEO, Content"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
            >
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
