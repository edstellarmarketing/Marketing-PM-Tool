'use client'

import { useState } from 'react'
import { RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'

interface Props {
  userId: string
}

export default function RecalculateScoresButton({ userId }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [detail, setDetail] = useState<string | null>(null)

  async function run() {
    setState('loading')
    setDetail(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}/recalculate-scores`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setState('error')
        setDetail(data.error ?? 'Failed')
      } else {
        setState('done')
        setDetail(`${data.months_updated} month(s) recalculated`)
        setTimeout(() => setState('idle'), 4000)
      }
    } catch {
      setState('error')
      setDetail('Network error')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={run}
        disabled={state === 'loading'}
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50
          border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100"
        title="Recalculates score_earned and bonus_points from actual tasks and awards"
      >
        <RefreshCw size={14} className={state === 'loading' ? 'animate-spin' : ''} />
        {state === 'loading' ? 'Recalculating…' : 'Recalculate Scores'}
      </button>
      {state === 'done' && (
        <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
          <CheckCircle2 size={13} /> {detail}
        </span>
      )}
      {state === 'error' && (
        <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
          <AlertTriangle size={13} /> {detail}
        </span>
      )}
    </div>
  )
}
