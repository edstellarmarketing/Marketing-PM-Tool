'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import type { AwardType } from '@/types'

interface Props {
  initialAwards: AwardType[]
}

interface FormState {
  name: string
  description: string
  icon: string
  bonus_points: string
}

const BLANK: FormState = { name: '', description: '', icon: '🏅', bonus_points: '25' }

export default function AwardsSettings({ initialAwards }: Props) {
  const [awards, setAwards] = useState<AwardType[]>(initialAwards)
  const [showNew, setShowNew] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startEdit(a: AwardType) {
    setEditId(a.id)
    setForm({ name: a.name, description: a.description ?? '', icon: a.icon, bonus_points: String(a.bonus_points) })
    setShowNew(false)
  }

  function cancelEdit() {
    setEditId(null)
    setShowNew(false)
    setForm(BLANK)
    setError(null)
  }

  async function handleSave(id?: string) {
    if (!form.name.trim()) { setError('Award name is required'); return }
    const pts = Number(form.bonus_points)
    if (!pts || pts < 1) { setError('Bonus points must be at least 1'); return }
    setSaving(true); setError(null)
    try {
      if (id) {
        const res = await fetch(`/api/admin/award-types/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name.trim(), description: form.description.trim() || null, icon: form.icon, bonus_points: pts }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to update')
        const updated = await res.json() as AwardType
        setAwards(prev => prev.map(a => a.id === id ? updated : a))
      } else {
        const res = await fetch('/api/admin/award-types', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name.trim(), description: form.description.trim() || null, icon: form.icon, bonus_points: pts }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to create')
        const created = await res.json() as AwardType
        setAwards(prev => [...prev, created])
      }
      cancelEdit()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(a: AwardType) {
    const res = await fetch(`/api/admin/award-types/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !a.is_active }),
    })
    if (res.ok) {
      const updated = await res.json() as AwardType
      setAwards(prev => prev.map(x => x.id === a.id ? updated : x))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deactivate this award type? Existing awards are unaffected.')) return
    const res = await fetch(`/api/admin/award-types/${id}`, { method: 'DELETE' })
    if (res.ok) setAwards(prev => prev.map(a => a.id === id ? { ...a, is_active: false } : a))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Award Types</h2>
          <p className="text-sm text-gray-500 mt-0.5">Define bonus awards admins can give to users for exceptional work.</p>
        </div>
        <button
          onClick={() => { setShowNew(true); setEditId(null); setForm(BLANK) }}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} /> New Award
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {showNew && (
        <AwardForm
          form={form}
          setForm={setForm}
          onSave={() => handleSave()}
          onCancel={cancelEdit}
          saving={saving}
          isNew
        />
      )}

      <div className="space-y-2">
        {awards.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No award types yet. Create your first one above.</p>
        )}
        {awards.map(a => (
          <div key={a.id} className={`border rounded-xl p-4 ${a.is_active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
            {editId === a.id ? (
              <AwardForm
                form={form}
                setForm={setForm}
                onSave={() => handleSave(a.id)}
                onCancel={cancelEdit}
                saving={saving}
              />
            ) : (
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0 mt-0.5">{a.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">{a.name}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">+{a.bonus_points} pts</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {a.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {a.description && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{a.description}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => startEdit(a)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleToggle(a)}
                    className={`p-1.5 rounded-lg transition-colors ${a.is_active ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}
                    title={a.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {a.is_active ? <X size={14} /> : <Check size={14} />}
                  </button>
                  {a.is_active && (
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Deactivate"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AwardForm({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  isNew,
}: {
  form: FormState
  setForm: (f: FormState) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  isNew?: boolean
}) {
  return (
    <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/30 space-y-3">
      <p className="text-sm font-semibold text-gray-800">{isNew ? 'New Award Type' : 'Edit Award Type'}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Icon (emoji)</label>
          <input
            type="text"
            value={form.icon}
            onChange={e => setForm({ ...form, icon: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="🏅"
            maxLength={4}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Bonus Points *</label>
          <input
            type="number"
            value={form.bonus_points}
            onChange={e => setForm({ ...form, bonus_points: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            min={1}
            max={999}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Award Name *</label>
        <input
          type="text"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g. Milestone Achieved"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          rows={2}
          placeholder="When is this award given?"
        />
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
