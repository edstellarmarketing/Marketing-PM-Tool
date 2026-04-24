'use client'

import { useState, useEffect } from 'react'
import { Sparkles, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Insights {
  month_comparison: string
  trend: string
  strengths: string[]
  focus_areas: string[]
  recommendations: string[]
  momentum: 'rising' | 'stable' | 'declining'
}

const MOMENTUM: Record<string, { label: string; color: string; Icon: typeof TrendingUp }> = {
  rising:    { label: 'Rising',    color: 'bg-green-100 text-green-700', Icon: TrendingUp   },
  stable:    { label: 'Stable',    color: 'bg-blue-100 text-blue-700',   Icon: Minus        },
  declining: { label: 'Declining', color: 'bg-red-100 text-red-700',     Icon: TrendingDown },
}

export default function UserInsightsPanel() {
  const [insights, setInsights]       = useState<Insights | null>(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)

  async function load() {
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/ai/user-insights', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setInsights(data.insights)
      setGeneratedAt(data.generated_at)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate insights')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const m    = insights ? (MOMENTUM[insights.momentum] ?? MOMENTUM.stable) : null
  const Icon = m?.Icon

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-purple-500" />
          <h2 className="font-semibold text-gray-900">AI Performance Insights</h2>
          {m && Icon && (
            <span className={cn('flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', m.color)}>
              <Icon size={11} /> {m.label}
            </span>
          )}
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Generating…' : generatedAt ? 'Refresh' : ''}
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && !insights && (
        <div className="px-5 py-10 flex flex-col items-center gap-3 text-gray-400">
          <RefreshCw size={20} className="animate-spin text-purple-400" />
          <p className="text-sm">Analysing your performance data…</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="px-5 py-8 text-center space-y-3">
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={load} className="text-xs text-blue-600 hover:underline">Try again</button>
        </div>
      )}

      {/* Content */}
      {insights && (
        <div className="p-5 space-y-5">

          {/* Month comparison */}
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1.5">This Month vs Last Month</p>
            <p className="text-sm text-gray-700 leading-relaxed">{insights.month_comparison}</p>
          </div>

          {/* 6-month trend */}
          <div className="bg-purple-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1.5">6-Month Progression</p>
            <p className="text-sm text-gray-700 leading-relaxed">{insights.trend}</p>
          </div>

          {/* Strengths + Focus areas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">✦ Strengths</p>
              <ul className="space-y-2">
                {insights.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0 mt-1.5" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-amber-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">⚑ Focus Areas</p>
              <ul className="space-y-2">
                {insights.focus_areas.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-1.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Recommendations */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Recommended Next Steps</p>
            <div className="space-y-2">
              {insights.recommendations.map((r, i) => (
                <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-100 text-purple-600 text-[10px] font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-xs text-gray-700">{r}</p>
                </div>
              ))}
            </div>
          </div>

          {generatedAt && (
            <p className="text-[11px] text-gray-300 text-right">
              Generated at {new Date(generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
