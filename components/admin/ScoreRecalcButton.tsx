'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

interface Props {
  month: number
  year: number
}

export default function ScoreRecalcButton({ month, year }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function recalc() {
    setLoading(true)
    setDone(false)
    await fetch('/api/admin/scores/recalculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, year }),
    })
    setLoading(false)
    setDone(true)
    router.refresh()
    setTimeout(() => setDone(false), 3000)
  }

  return (
    <button
      onClick={recalc}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
    >
      <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
      {loading ? 'Recalculating…' : done ? 'Done ✓' : 'Recalculate Scores'}
    </button>
  )
}
