'use client'

import { useState } from 'react'
import { Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Insights {
  summary: string
  at_risk: string[]
  overloaded: string[]
  top_performers: string[]
  recommendations: string[]
  team_health: 'excellent' | 'good' | 'needs_attention' | 'critical'
}

const healthColors: Record<string, string> = {
  excellent: 'bg-green-100 text-green-700',
  good: 'bg-blue-100 text-blue-700',
  needs_attention: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

const healthLabel: Record<string, string> = {
  excellent: '✅ Excellent',
  good: '👍 Good',
  needs_attention: '⚠️ Needs Attention',
  critical: '🚨 Critical',
}

export default function TeamInsightsPanel() {
  const [loading, setLoading] = useState(false)
  const [insights, setInsights] = useState<Insights | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)

    const res = await fetch('/api/ai/team-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to generate insights')
      return
    }
    const data = await res.json()
    setInsights(data.insights)
    setGeneratedAt(data.generated_at)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-purple-500" />
          <h2 className="font-semibold text-gray-900">AI Team Insights</h2>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : insights ? <RefreshCw size={12} /> : <Sparkles size={12} />}
          {loading ? 'Analysing…' : insights ? 'Refresh' : 'Generate Insights'}
        </button>
      </div>

      <div className="p-5">
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!insights && !loading && (
          <p className="text-sm text-gray-400 text-center py-6">
            Click "Generate Insights" to get an AI analysis of your team's performance this month.
          </p>
        )}

        {loading && (
          <div className="flex items-center justify-center py-10 gap-3 text-gray-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Analysing team performance…</span>
          </div>
        )}

        {insights && (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <span className={cn('text-xs px-2 py-1 rounded-full font-medium flex-shrink-0', healthColors[insights.team_health])}>
                {healthLabel[insights.team_health]}
              </span>
              <p className="text-sm text-gray-700 leading-relaxed">{insights.summary}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {insights.top_performers.length > 0 && (
                <div className="bg-green-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-green-700 mb-2">🏆 Top Performers</p>
                  <ul className="space-y-1">
                    {insights.top_performers.map((name, i) => (
                      <li key={i} className="text-sm text-green-800">{name}</li>
                    ))}
                  </ul>
                </div>
              )}

              {insights.at_risk.length > 0 && (
                <div className="bg-orange-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-orange-700 mb-2">⚠️ Needs Support</p>
                  <ul className="space-y-1">
                    {insights.at_risk.map((name, i) => (
                      <li key={i} className="text-sm text-orange-800">{name}</li>
                    ))}
                  </ul>
                </div>
              )}

              {insights.overloaded.length > 0 && (
                <div className="bg-red-50 rounded-xl p-4">
                  <p className="text-xs font-semibold text-red-700 mb-2">🔴 Overloaded</p>
                  <ul className="space-y-1">
                    {insights.overloaded.map((name, i) => (
                      <li key={i} className="text-sm text-red-800">{name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {insights.recommendations.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Recommendations</p>
                <ul className="space-y-2">
                  {insights.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-purple-500 font-bold mt-0.5">{i + 1}.</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {generatedAt && (
              <p className="text-xs text-gray-400">
                Generated {new Date(generatedAt).toLocaleString('en-IN')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
