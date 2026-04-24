'use client'

import { useState } from 'react'
import { Sparkles, Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Suggestion {
  title: string
  description: string
  category: string
  priority: string
  task_type?: string
  complexity?: string
  estimated_days: number
}

interface Props {
  month?: number
  year?: number
  onImport: (suggestion: Suggestion) => void
}

const priorityColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

const taskTypeLabels: Record<string, string> = {
  monthly_task: '🔁 Monthly',
  new_implementation: '🚀 New Impl.',
  ai: '🤖 AI',
}

const complexityLabels: Record<string, string> = {
  easy: '🟢 Easy',
  medium: '🟡 Medium',
  difficult: '🔴 Difficult',
}

export default function TaskSuggestionPanel({ month, year, onImport }: Props) {
  const [open, setOpen] = useState(false)
  const [goal, setGoal] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [imported, setImported] = useState<Set<number>>(new Set())

  async function generate() {
    if (!goal.trim()) return
    setLoading(true)
    setError(null)
    setSuggestions([])
    setImported(new Set())

    const res = await fetch('/api/ai/suggest-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, month, year }),
    })
    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed')
      return
    }
    const data = await res.json()
    setSuggestions(data.suggestions ?? [])
  }

  function handleImport(i: number) {
    onImport(suggestions[i])
    setImported(prev => new Set(prev).add(i))
  }

  return (
    <div className="border border-purple-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-purple-50 hover:bg-purple-100 transition-colors text-sm font-medium text-purple-700"
      >
        <Sparkles size={15} />
        Generate tasks with AI
        <span className="ml-auto text-purple-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-4 space-y-4 bg-white">
          <div className="flex gap-2">
            <input
              type="text"
              value={goal}
              onChange={e => setGoal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), generate())}
              placeholder="Describe your goal (e.g. grow Instagram by 1k followers)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              type="button"
              onClick={generate}
              disabled={loading || !goal.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {loading ? 'Thinking…' : 'Generate'}
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-medium">Click + to add a task to your form</p>
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-start gap-3 p-3 border rounded-lg transition-colors',
                    imported.has(i) ? 'border-green-200 bg-green-50' : 'border-gray-200 hover:border-purple-200'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{s.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', priorityColors[s.priority] ?? 'bg-gray-100 text-gray-600')}>
                        {s.priority}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium capitalize">
                        {s.category}
                      </span>
                      {s.task_type && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                          {taskTypeLabels[s.task_type] ?? s.task_type}
                        </span>
                      )}
                      {s.complexity && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                          {complexityLabels[s.complexity] ?? s.complexity}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">~{s.estimated_days}d</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleImport(i)}
                    disabled={imported.has(i)}
                    className={cn(
                      'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors',
                      imported.has(i)
                        ? 'bg-green-500 text-white cursor-default'
                        : 'bg-purple-100 text-purple-600 hover:bg-purple-600 hover:text-white'
                    )}
                  >
                    {imported.has(i) ? '✓' : <Plus size={14} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
