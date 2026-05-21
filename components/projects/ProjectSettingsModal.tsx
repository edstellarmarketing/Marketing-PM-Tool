'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Save, Trash2, Settings as SettingsIcon, Mail, Send } from 'lucide-react'
import type { Project, ProjectStatus } from '@/types'

interface Props {
  project: Project
  onClose: () => void
}

export default function ProjectSettingsModal({ project, onClose }: Props) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: project.name,
    description: project.description ?? '',
    start_date: project.start_date ?? '',
    end_date: project.end_date ?? '',
    status: (project.status ?? 'active') as ProjectStatus,
    notify_email_enabled: project.notify_email_enabled ?? true,
    notify_owner_email_enabled: project.notify_owner_email_enabled ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sendingTest, setSendingTest] = useState(false)
  const [testStatus, setTestStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSendTestEmail() {
    setError(null)
    setTestStatus(null)
    setSendingTest(true)
    const res = await fetch('/api/admin/send-test-project-digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: project.id }),
    })
    setSendingTest(false)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'Failed to send test email')
      return
    }
    setTestStatus(data.to ? `Sent to ${data.to}` : 'Sent')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        description: form.description.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: form.status,
        notify_email_enabled: form.notify_email_enabled,
        notify_owner_email_enabled: form.notify_owner_email_enabled,
      }),
    })

    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data.error === 'string' ? data.error : 'Failed to save project')
      return
    }
    router.refresh()
    onClose()
  }

  async function handleDelete() {
    if (!confirm(`Delete the project "${project.name}"? This permanently removes all its tasks, owners, and supporting members. This cannot be undone.`)) return
    setError(null)
    setDeleting(true)

    const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data.error === 'string' ? data.error : 'Failed to delete project')
      return
    }
    router.replace('/projects')
    router.refresh()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <SettingsIcon size={18} className="text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Project Settings</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Name *</label>
            <input
              required
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <select
              value={form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value as ProjectStatus }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="active">Active</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
              <Mail size={14} className="text-blue-600" />
              Email notifications
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.notify_owner_email_enabled}
                onChange={e => setForm(p => ({ ...p, notify_owner_email_enabled: e.target.checked }))}
                className="mt-1 rounded border-gray-300"
              />
              <span className="flex-1">
                <span className="block text-sm text-gray-900 dark:text-white">Notify project owners daily</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Each owner gets a department digest at 08:00 IST (their tasks, pending today, upcoming).
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.notify_email_enabled}
                onChange={e => setForm(p => ({ ...p, notify_email_enabled: e.target.checked }))}
                className="mt-1 rounded border-gray-300"
              />
              <span className="flex-1">
                <span className="block text-sm text-gray-900 dark:text-white">Notify admins daily</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Admins get a per-project digest at 08:00 IST with owner progress and top pending tasks.
                </span>
              </span>
            </label>

            <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={handleSendTestEmail}
                disabled={sendingTest || saving || deleting}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                <Send size={13} />
                {sendingTest ? 'Sending…' : 'Send test admin email to me'}
              </button>
              {testStatus && (
                <span className="text-xs text-emerald-700 dark:text-emerald-400">{testStatus}</span>
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving || deleting}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={15} />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving || deleting}
              className="ml-auto flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg disabled:opacity-50"
            >
              <Trash2 size={15} />
              {deleting ? 'Deleting…' : 'Delete Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
