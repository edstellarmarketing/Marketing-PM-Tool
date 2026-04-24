'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import type { Goal, GoalType, ChecklistItem } from '@/types'

const categories = ['content', 'social', 'email', 'ads', 'seo', 'design', 'other']

interface Props {
  onAdd: (goal: Goal) => void
}

export default function AddGoalForm({ onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<GoalType>('one_time')
  const [form, setForm] = useState({ title: '', target_metric: '', category: '', score_weight: 10 })
  const [items, setItems] = useState<{ id: string; title: string }[]>([
    { id: uuidv4(), title: '' },
  ])

  function addItem() {
    setItems(p => [...p, { id: uuidv4(), title: '' }])
  }

  function removeItem(id: string) {
    if (items.length === 1) return
    setItems(p => p.filter(i => i.id !== id))
  }

  function updateItem(id: string, title: string) {
    setItems(p => p.map(i => (i.id === id ? { ...i, title } : i)))
  }

  function handleClose() {
    setOpen(false)
    setType('one_time')
    setForm({ title: '', target_metric: '', category: '', score_weight: 10 })
    setItems([{ id: uuidv4(), title: '' }])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return

    let checklist: ChecklistItem[] | undefined
    if (type === 'checklist') {
      checklist = items
        .filter(i => i.title.trim())
        .map(i => ({ id: i.id, title: i.title.trim(), status: 'todo' as const }))
      if (checklist.length === 0) return
    }

    onAdd({
      id: uuidv4(),
      title: form.title.trim(),
      target_metric: form.target_metric.trim() || null,
      category: form.category || null,
      score_weight: form.score_weight,
      progress: 0,
      type,
      checklist,
    })
    handleClose()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors w-full"
      >
        <Plus size={16} /> Add Goal
      </button>
    )
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-blue-800">New Goal</p>
        <button onClick={handleClose} className="text-blue-400 hover:text-blue-600">
          <X size={16} />
        </button>
      </div>

      {/* Goal type picker */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          type="button"
          onClick={() => setType('one_time')}
          className={`p-3 rounded-xl border-2 text-left transition-all ${
            type === 'one_time'
              ? 'border-blue-500 bg-white shadow-sm'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <p className="text-sm font-semibold text-gray-800">⚡ One-time Goal</p>
          <p className="text-xs text-gray-500 mt-0.5">Single outcome — full points on completion only</p>
        </button>
        <button
          type="button"
          onClick={() => setType('checklist')}
          className={`p-3 rounded-xl border-2 text-left transition-all ${
            type === 'checklist'
              ? 'border-blue-500 bg-white shadow-sm'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <p className="text-sm font-semibold text-gray-800">☑ Checklist Goal</p>
          <p className="text-xs text-gray-500 mt-0.5">Sub-tasks — points by % of items done</p>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          required
          type="text"
          placeholder="Goal title *"
          value={form.title}
          onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />

        {type === 'one_time' && (
          <input
            type="text"
            placeholder="Target metric (e.g. 5k reach, 10 posts)"
            value={form.target_metric}
            onChange={e => setForm(p => ({ ...p, target_metric: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <select
            value={form.category}
            onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Category</option>
            {categories.map(c => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={100}
            value={form.score_weight}
            onChange={e => setForm(p => ({ ...p, score_weight: parseInt(e.target.value) || 10 }))}
            placeholder="Score pts"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>

        {/* Checklist items */}
        {type === 'checklist' && (
          <div className="space-y-2 bg-white border border-gray-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">Checklist Items</p>
            {items.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-5 text-right flex-shrink-0">{idx + 1}.</span>
                <input
                  type="text"
                  value={item.title}
                  onChange={e => updateItem(item.id, e.target.value)}
                  placeholder={`Item ${idx + 1}`}
                  className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  disabled={items.length === 1}
                  className="text-gray-300 hover:text-red-400 disabled:opacity-30 transition-colors flex-shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium mt-1"
            >
              <Plus size={12} /> Add item
            </button>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add Goal
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
