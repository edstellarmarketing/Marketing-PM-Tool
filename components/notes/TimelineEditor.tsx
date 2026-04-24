'use client'

import { Plus, X } from 'lucide-react'
import type { MeetingNoteTimeline } from '@/types'

interface Props {
  timelines: MeetingNoteTimeline[]
  onChange: (timelines: MeetingNoteTimeline[]) => void
}

export default function TimelineEditor({ timelines, onChange }: Props) {
  function add() {
    if (timelines.length >= 10) return
    onChange([...timelines, { label: '', date: null }])
  }

  function remove(i: number) {
    onChange(timelines.filter((_, idx) => idx !== i))
  }

  function update(i: number, field: 'label' | 'date', value: string) {
    onChange(timelines.map((t, idx) =>
      idx === i ? { ...t, [field]: value || null } : t
    ))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-700">Timelines</label>
        <button
          type="button"
          onClick={add}
          disabled={timelines.length >= 10}
          className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={12} />
          Add Timeline
        </button>
      </div>

      {timelines.length === 0 ? (
        <div className="text-xs text-gray-400 italic py-3 text-center border border-dashed border-gray-200 rounded-lg">
          No timelines added — click &ldquo;Add Timeline&rdquo; to track milestones
        </div>
      ) : (
        <div className="space-y-2">
          {timelines.map((t, i) => (
            <div key={i} className="flex items-center gap-2 group hover:bg-gray-50 rounded-lg p-1 -mx-1">
              <input
                type="text"
                value={t.label}
                onChange={e => update(i, 'label', e.target.value)}
                placeholder="Milestone or checkpoint..."
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <input
                type="date"
                value={t.date ?? ''}
                onChange={e => update(i, 'date', e.target.value)}
                className="w-36 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="p-1.5 text-gray-300 hover:text-red-400 rounded hover:bg-red-50 transition-colors flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {timelines.length >= 10 && (
        <p className="text-xs text-gray-400 mt-1.5">Max 10 timelines reached.</p>
      )}
    </div>
  )
}
