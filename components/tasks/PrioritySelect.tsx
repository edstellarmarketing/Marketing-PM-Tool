'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

const options = [
  { value: 'low',      label: 'Low',      cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  { value: 'medium',   label: 'Medium',   cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'high',     label: 'High',     cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'critical', label: 'Critical', cls: 'bg-red-100 text-red-700 border-red-200' },
]

interface Props {
  taskId: string
  priority: string
  disabled?: boolean
}

export default function PrioritySelect({ taskId, priority: initial, disabled }: Props) {
  const [priority, setPriority] = useState(initial)
  const [saving, setSaving] = useState(false)

  const opt = options.find(o => o.value === priority) ?? options[1]

  async function handleChange(next: string) {
    if (next === priority || saving) return
    setSaving(true)
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: next }),
    })
    setSaving(false)
    if (res.ok) setPriority(next)
  }

  if (disabled) {
    return (
      <span className={cn('text-xs px-2 py-1 rounded-full font-medium border', opt.cls)}>
        {opt.label}
      </span>
    )
  }

  return (
    <select
      value={priority}
      onChange={e => handleChange(e.target.value)}
      disabled={saving}
      className={cn(
        'text-xs px-2 py-1 rounded-full font-medium border cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500',
        opt.cls,
        saving && 'opacity-60'
      )}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
