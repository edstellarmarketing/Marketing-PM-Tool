'use client'

import { useState } from 'react'
import { X, Plus, Save, Trash2 } from 'lucide-react'
import type { ProjectOwner, ProjectTask } from '@/types'

interface Props {
  projectId: string
  owners: ProjectOwner[]
  defaultOwnerId: string | null
  task?: ProjectTask | null
  onClose: () => void
  onCreated: () => void
}

export default function AddProjectTaskDrawer({ projectId, owners, defaultOwnerId, task, onClose, onCreated }: Props) {
  const isEdit = !!task

  const [form, setForm] = useState({
    owner_id: task?.owner_id ?? defaultOwnerId ?? '',
    title: task?.title ?? '',
    description: task?.description ?? '',
    priority: (task?.priority ?? 'medium') as 'low' | 'medium' | 'high' | 'critical',
    status: (task?.status ?? 'pending') as 'pending' | 'in_progress' | 'completed',
    progress: task?.progress ?? 0,
    due_date: task?.due_date ?? '',
    dependency_task: task?.dependency_task ?? '',
    dependency_details: task?.dependency_details ?? '',
    dependency_status: task?.dependency_status ?? '',
    dependency_owner: task?.dependency_owner ?? '',
    final_comments: task?.final_comments ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedOwner = owners.find(o => o.id === form.owner_id) ?? null
  const projectOwnerName = selectedOwner?.user?.full_name ?? ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.owner_id) {
      setError('Pick a category first')
      return
    }
    setError(null)
    setLoading(true)

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      priority: form.priority,
      status: form.status,
      progress: Number(form.progress) || 0,
      due_date: form.due_date || null,
      dependency_task: form.dependency_task.trim() || null,
      dependency_details: form.dependency_details.trim() || null,
      dependency_status: form.dependency_status.trim() || null,
      dependency_owner: form.dependency_owner.trim() || null,
      final_comments: form.final_comments.trim() || null,
    }

    const res = isEdit
      ? await fetch(`/api/project-tasks/${task!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch(`/api/projects/${projectId}/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, owner_id: form.owner_id }),
        })

    setLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data.error === 'string' ? data.error : `Failed to ${isEdit ? 'update' : 'create'} task`)
      return
    }
    onCreated()
  }

  async function handleDelete() {
    if (!isEdit) return
    if (!confirm('Delete this task? This cannot be undone.')) return
    setError(null)
    setDeleting(true)
    const res = await fetch(`/api/project-tasks/${task!.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data.error === 'string' ? data.error : 'Failed to delete task')
      return
    }
    onCreated()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{isEdit ? 'Edit Task' : 'Add Task'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category / Department *</label>
            <select
              required
              value={form.owner_id}
              onChange={e => setForm(p => ({ ...p, owner_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select category…</option>
              {owners.map(o => (
                <option key={o.id} value={o.id}>
                  {o.department} — {o.user?.full_name ?? 'Unknown'}
                </option>
              ))}
            </select>
            {projectOwnerName && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Project Owner: <span className="font-medium text-gray-700 dark:text-gray-200">{projectOwnerName}</span> (auto-set)
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title *</label>
            <input
              required
              autoFocus
              type="text"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Header design"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Priority</label>
            <select
              value={form.priority}
              onChange={e => setForm(p => ({ ...p, priority: e.target.value as typeof p.priority }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(p => ({ ...p, status: e.target.value as typeof p.status }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Progress (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={form.progress}
                onChange={e => setForm(p => ({ ...p, progress: Math.max(0, Math.min(100, Number(e.target.value))) }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="pt-2 border-t border-gray-200 dark:border-gray-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Dependency (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dependency Task</label>
                <input
                  type="text"
                  value={form.dependency_task}
                  onChange={e => setForm(p => ({ ...p, dependency_task: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="What is this blocked on?"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dependency Owner</label>
                <input
                  type="text"
                  value={form.dependency_owner}
                  onChange={e => setForm(p => ({ ...p, dependency_owner: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Person or team"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dependency Status</label>
                <input
                  type="text"
                  value={form.dependency_status}
                  onChange={e => setForm(p => ({ ...p, dependency_status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Pending / In Review / Done…"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dependency Details</label>
                <input
                  type="text"
                  value={form.dependency_details}
                  onChange={e => setForm(p => ({ ...p, dependency_details: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Why it's blocking"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Final Comments</label>
            <textarea
              value={form.final_comments}
              onChange={e => setForm(p => ({ ...p, final_comments: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Owner's commentary covering the task, dependencies, status, next steps…"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={loading || deleting}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isEdit ? <Save size={15} /> : <Plus size={15} />}
              {loading ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save Changes' : 'Add Task')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading || deleting}
                className="ml-auto flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg disabled:opacity-50"
              >
                <Trash2 size={15} />
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
