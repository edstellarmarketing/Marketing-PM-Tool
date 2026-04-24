'use client'

import { useState } from 'react'
import { Sparkles, Loader2, Plus } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import type { Goal } from '@/types'

interface Props {
  month: number
  year: number
  department?: string
  onImport: (goals: Goal[]) => void
}

export default function PlanGeneratorPanel({ month, year, department, onImport }: Props) {
  const [open, setOpen] = useState(false)
  const [objectives, setObjectives] = useState('')
  const [loading, setLoading] = useState(false)
  const [goals, setGoals] = useState<Goal[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function generate() {
    if (!objectives.trim()) return
    setLoading(true)
    setError(null)
    setGoals([])
    setDone(false)

    const res = await fetch('/api/ai/generate-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectives, month, year, department }),
    })
    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed')
      return
    }
    const data = await res.json()
    const withIds: Goal[] = (data.goals ?? []).map((g: Omit<Goal, 'id' | 'progress'>) => ({
      ...g,
      id: uuidv4(),
      progress: 0,
      target_metric: g.target_metric ?? null,
      category: g.category ?? null,
    }))
    setGoals(withIds)
  }

  function addAll() {
    onImport(goals)
    setDone(true)
  }

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']

  return (
    <div className="border border-purple-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-purple-50 hover:bg-purple-100 transition-colors text-sm font-medium text-purple-700"
      >
        <Sparkles size={15} />
        Generate plan with AI
        <span className="ml-auto text-purple-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-4 space-y-4 bg-white">
          <p className="text-xs text-gray-500">
            Describe what you want to achieve in <strong>{MONTHS[month - 1]} {year}</strong> and AI will generate structured goals.
          </p>
          <div className="space-y-2">
            <textarea
              rows={3}
              value={objectives}
              onChange={e => setObjectives(e.target.value)}
              placeholder="e.g. I want to grow our blog traffic by 30%, launch the Q2 email campaign, and increase LinkedIn followers by 500"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
            <button
              type="button"
              onClick={generate}
              disabled={loading || !objectives.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {loading ? 'Generating plan…' : 'Generate Goals'}
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {goals.length > 0 && !done && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-600">{goals.length} goals generated</p>
                <button
                  type="button"
                  onClick={addAll}
                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <Plus size={12} /> Add All to Plan
                </button>
              </div>
              {goals.map(g => (
                <div key={g.id} className="p-3 border border-gray-200 rounded-lg space-y-1">
                  <p className="text-sm font-medium text-gray-900">{g.title}</p>
                  {g.target_metric && <p className="text-xs text-gray-500">🎯 {g.target_metric}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    {g.category && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 capitalize">{g.category}</span>
                    )}
                    <span className="text-xs text-gray-400">{g.score_weight} pts</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {done && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              ✓ Goals added to your plan. Click "Save Changes" to persist.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
