'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'

interface Props {
  userId: string
  financialYear: string
  hasSnapshot: boolean
}

export default function GenerateAppraisalButton({ userId, financialYear, hasSnapshot }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/appraisals/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ financial_year: financialYear }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to generate')
      return
    }
    router.refresh()
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={generate}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
      >
        <Sparkles size={15} />
        {loading ? 'Generating…' : hasSnapshot ? 'Regenerate' : 'Generate Appraisal'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
