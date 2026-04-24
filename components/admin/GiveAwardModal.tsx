'use client'

import { useState, useEffect } from 'react'
import { X, Award } from 'lucide-react'
import type { AwardType } from '@/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface TaskOption {
  id: string
  title: string
  status: string
  due_date: string | null
}

interface Props {
  userId: string
  userName: string
  taskId?: string
  taskTitle?: string
  tasks?: TaskOption[]   // user's tasks passed from parent (user profile page)
  onClose: () => void
  onAwarded?: () => void
}

export default function GiveAwardModal({ userId, userName, taskId, taskTitle, tasks, onClose, onAwarded }: Props) {
  const now = new Date()
  const [awardTypes, setAwardTypes] = useState<AwardType[]>([])
  const [loadingTypes, setLoadingTypes] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState(taskId ?? '')
  const [note, setNote] = useState('')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetch('/api/admin/award-types')
      .then(async r => {
        if (!r.ok) throw new Error(`Failed to load award types (${r.status})`)
        return r.json()
      })
      .then((data: unknown) => {
        if (!Array.isArray(data)) throw new Error('Unexpected response from server')
        const active = (data as AwardType[]).filter(a => a.is_active)
        setAwardTypes(active)
        if (active.length > 0) setSelectedType(active[0].id)
      })
      .catch(e => setFetchError(e.message))
      .finally(() => setLoadingTypes(false))
  }, [])

  // Auto-set month/year from the linked task's due_date when a task is selected
  useEffect(() => {
    if (!selectedTaskId || !tasks) return
    const t = tasks.find(t => t.id === selectedTaskId)
    if (t?.due_date) {
      const d = new Date(t.due_date)
      setMonth(d.getMonth() + 1)
      setYear(d.getFullYear())
    }
  }, [selectedTaskId, tasks])

  const selected = awardTypes.find(a => a.id === selectedType)
  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  // Tasks to show in dropdown — combine prop tasks with the pre-linked task if any
  const taskOptions = tasks ?? (taskId && taskTitle ? [{ id: taskId, title: taskTitle, status: '', due_date: null }] : [])

  async function handleSubmit() {
    if (!selectedType) { setError('Please select an award type'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/admin/awards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          award_type_id: selectedType,
          task_id: selectedTaskId || null,
          note: note.trim() || null,
          month,
          year,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to give award')
      setSuccess(true)
      setTimeout(() => {
        onAwarded?.()
        onClose()
      }, 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <Award size={18} className="text-blue-600" />
            <h2 className="font-bold text-gray-900">Give Award</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            Awarding <span className="font-semibold text-gray-900">{userName}</span>
          </p>

          {fetchError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{fetchError}</div>
          )}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          {success && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700 font-medium">
              Award given successfully!
            </div>
          )}

          {/* Award type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Award Type *</label>
            {loadingTypes ? (
              <p className="text-sm text-gray-400">Loading award types…</p>
            ) : awardTypes.length === 0 ? (
              <p className="text-sm text-gray-400">No active award types. Create some in Admin → Settings → Awards.</p>
            ) : (
              <select
                value={selectedType}
                onChange={e => setSelectedType(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {awardTypes.map(a => (
                  <option key={a.id} value={a.id}>{a.icon} {a.name} (+{a.bonus_points} pts)</option>
                ))}
              </select>
            )}
            {selected?.description && (
              <p className="mt-1.5 text-xs text-gray-400">{selected.description}</p>
            )}
          </div>

          {/* Task link */}
          {taskOptions.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Linked Task (optional)</label>
              <select
                value={selectedTaskId}
                onChange={e => setSelectedTaskId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— No task linked —</option>
                {taskOptions.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.title}{t.due_date ? ` · ${new Date(t.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">Selecting a task will auto-set the award month to its due date.</p>
            </div>
          )}

          {/* Month + Year */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Month *</label>
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {MONTHS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Year *</label>
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Note (optional)</label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
              placeholder="Add a personal message…"
            />
          </div>

          {/* Preview */}
          {selected && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">{selected.icon}</span>
                <span className="text-sm font-medium text-gray-800">{selected.name}</span>
              </div>
              <span className="text-sm font-bold text-blue-700">+{selected.bonus_points} pts</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || success || !selectedType || loadingTypes}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Giving award…' : 'Give Award'}
          </button>
        </div>
      </div>
    </div>
  )
}
