'use client'

import { useState, useTransition } from 'react'
import { CheckSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SubTask } from '@/types'

interface Props {
  taskId: string
  initialSubtasks: SubTask[]
}

export default function TaskSubtasks({ taskId, initialSubtasks }: Props) {
  const [subtasks, setSubtasks] = useState<SubTask[]>(initialSubtasks)
  const [pending, startTransition] = useTransition()
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const done = subtasks.filter(s => s.completed).length
  const total = subtasks.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  function toggle(id: string) {
    const prevSubtasks = subtasks
    const updated = subtasks.map(s => s.id === id ? { ...s, completed: !s.completed } : s)

    setSubtasks(updated)
    setUpdatingId(id)
    setError(null)

    startTransition(async () => {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtasks: updated }),
      })
      setUpdatingId(null)
      if (!res.ok) {
        setSubtasks(prevSubtasks)
        setError('Failed to update. Please try again.')
      }
    })
  }

  return (
    <div className="pt-4 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <CheckSquare size={15} className="text-gray-400" />
          Sub-tasks
        </h2>
        <span className="text-xs text-gray-400 font-medium">{done}/{total} done</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-4">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-gray-300'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="space-y-2">
        {subtasks.map(s => {
          const isUpdating = updatingId === s.id && pending
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              disabled={pending}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left group disabled:cursor-wait"
            >
              <div className={cn(
                'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors mt-0.5',
                isUpdating ? 'border-gray-300 bg-gray-100 animate-pulse' :
                s.completed ? 'bg-green-500 border-green-500' : 'border-gray-300 group-hover:border-green-400'
              )}>
                {s.completed && !isUpdating && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className={cn(
                  'text-sm transition-colors',
                  s.completed ? 'line-through text-gray-400' : 'text-gray-700'
                )}>
                  {s.title}
                </span>
                {s.due_date && (
                  <span className={cn(
                    'block text-xs mt-0.5',
                    !s.completed && s.due_date < today ? 'text-red-500 font-medium' : 'text-gray-400'
                  )}>
                    Due {new Date(s.due_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    {!s.completed && s.due_date < today && ' · ⚠ Overdue'}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}
    </div>
  )
}
