'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import { cn, formatDate, isOverdue } from '@/lib/utils'
import type { Task } from '@/types'

const statusStyles: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  review: 'bg-yellow-100 text-yellow-700',
  done: 'bg-green-100 text-green-700',
  blocked: 'bg-red-100 text-red-700',
}

interface Props {
  task: Task
}

export default function ScoreOverrideRow({ task }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [scoreWeight, setScoreWeight] = useState(task.score_weight)
  const [scoreEarned, setScoreEarned] = useState(task.score_earned)
  const [saving, setSaving] = useState(false)
  const [deleted, setDeleted] = useState(false)

  async function save() {
    setSaving(true)
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score_weight: scoreWeight, score_earned: scoreEarned }),
    })
    setSaving(false)
    setEditing(false)
    router.refresh()
  }

  async function handleDelete() {
    if (!confirm(`Delete "${task.title}"? This cannot be undone.`)) return
    const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
    if (res.ok) {
      setDeleted(true)
      router.refresh()
    }
  }

  const overdue = isOverdue(task.due_date, task.status)

  if (deleted) return null

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-3 px-4">
        <Link
          href={`/tasks/${task.id}`}
          className={cn('text-sm font-medium hover:underline hover:text-blue-600 transition-colors', overdue ? 'text-red-600' : 'text-gray-900')}
        >
          {task.title}
        </Link>
        {task.category && <p className="text-xs text-gray-400 mt-0.5 capitalize">{task.category}</p>}
      </td>
      <td className="py-3 px-4">
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', statusStyles[task.status])}>
          {task.status.replace('_', ' ')}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-gray-600">{formatDate(task.due_date)}</td>
      <td className="py-3 px-4">
        {editing ? (
          <input
            type="number"
            min={0}
            value={scoreWeight}
            onChange={e => setScoreWeight(parseInt(e.target.value) || 0)}
            className="w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : (
          <span className="text-sm text-gray-700">{task.score_weight}</span>
        )}
      </td>
      <td className="py-3 px-4">
        {editing ? (
          <input
            type="number"
            min={0}
            value={scoreEarned}
            onChange={e => setScoreEarned(parseInt(e.target.value) || 0)}
            className="w-16 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        ) : (
          <span className="text-sm text-gray-700">{task.score_earned}</span>
        )}
      </td>
      <td className="py-3 px-4">
        {editing ? (
          <div className="flex gap-1">
            <button onClick={save} disabled={saving} className="p-1.5 rounded bg-green-100 text-green-700 hover:bg-green-200 transition-colors">
              <Check size={13} />
            </button>
            <button onClick={() => { setEditing(false); setScoreWeight(task.score_weight); setScoreEarned(task.score_earned) }} className="p-1.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
              <X size={13} />
            </button>
          </div>
        ) : (
          <div className="flex gap-1">
            <button onClick={() => setEditing(true)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <Pencil size={13} />
            </button>
            <button onClick={handleDelete} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}
