'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, FolderPlus, Plus, ChevronUp, ChevronDown } from 'lucide-react'
import { PROJECT_DOMAINS, type ProjectDomain } from '@/types'

interface Props {
  onClose: () => void
}

export default function CreateProjectModal({ onClose }: Props) {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '',
    domain: '' as '' | ProjectDomain,
    description: '',
    start_date: '',
    end_date: '',
    status: 'active' as 'active' | 'on_hold' | 'completed' | 'archived',
  })
  const [groups, setGroups] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addGroup() {
    setGroups(prev => [...prev, ''])
  }
  function updateGroup(index: number, value: string) {
    setGroups(prev => prev.map((g, i) => (i === index ? value : g)))
  }
  function removeGroup(index: number) {
    setGroups(prev => prev.filter((_, i) => i !== index))
  }
  function moveGroup(index: number, dir: -1 | 1) {
    setGroups(prev => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.domain) {
      setError('Please pick a Domain.')
      return
    }
    setLoading(true)

    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        domain: form.domain,
        description: form.description.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: form.status,
        groups: groups.map(g => g.trim()).filter(Boolean),
      }),
    })

    setLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data.error === 'string' ? data.error : 'Failed to create project')
      return
    }
    const created = await res.json()
    router.refresh()
    router.push(`/projects/${created.id}`)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">New Project</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Domain *</label>
            <select
              required
              value={form.domain}
              onChange={e => setForm(p => ({ ...p, domain: e.target.value as '' | ProjectDomain }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="" disabled>Select a domain…</option>
              {PROJECT_DOMAINS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Shown as a prefix to the project name (e.g. <strong>{form.domain || 'Edstellar'} - {form.name || 'LMS'}</strong>).
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Name *</label>
            <input
              required
              autoFocus
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Example CMS Website"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="What this project is about…"
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
              onChange={e => setForm(p => ({ ...p, status: e.target.value as typeof p.status }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="active">Active</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Task Groups (optional)</label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Organize tasks into phases or sections (e.g. Pre-Launch, Launch Day). You can also add or edit these later.
            </p>
            {groups.length > 0 && (
              <div className="space-y-2 mb-2">
                {groups.map((g, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-5 text-center text-xs font-mono text-gray-400">{i + 1}</span>
                    <input
                      type="text"
                      value={g}
                      onChange={e => updateGroup(i, e.target.value)}
                      placeholder={`Group ${i + 1} name`}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => moveGroup(i, -1)}
                        disabled={i === 0}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                        title="Move up"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveGroup(i, 1)}
                        disabled={i === groups.length - 1}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                        title="Move down"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeGroup(i)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg"
                      title="Remove group"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={addGroup}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20"
            >
              <Plus size={14} />
              Add group
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <FolderPlus size={15} />
              {loading ? 'Creating…' : 'Create Project'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
