'use client'

import { Zap, Lock, Sparkles } from 'lucide-react'
import type { PointConfig } from '@/types'
import type { VolumeTierName } from '@/lib/scoring'

// Built-in icons — always take priority over the description field
const BUILTIN_ICONS: Record<string, string> = {
  task_type_monthly_task: '🔁',
  task_type_new_implementation: '🚀',
  task_type_ai: '🤖',
  complexity_easy: '🟢',
  complexity_medium: '🟡',
  complexity_difficult: '🔴',
}

function icon(c: PointConfig): string {
  // Built-in keys always use hardcoded emoji
  if (BUILTIN_ICONS[c.config_key]) return BUILTIN_ICONS[c.config_key]
  // Custom types: admin stored emoji in description
  if (c.description && c.description.trim().length <= 4) return c.description.trim()
  return c.category === 'task_type' ? '📋' : '🔵'
}

function description(c: PointConfig): string | null {
  // For built-ins, description is proper text; for custom types, description is emoji (skip)
  if (BUILTIN_ICONS[c.config_key]) return c.description ?? null
  return null
}

interface Props {
  configs: PointConfig[]
  taskType: string
  complexity: string
  onTypeChange: (v: string) => void
  onComplexityChange: (v: string) => void
  locked?: boolean
  lockedReason?: string     // custom badge label when locked for a reason other than completion
  preview?: {
    potential: number
    max: number
    volumeBonus?: number
    tier?: { name: VolumeTierName; label: string }
    subtaskCount?: number
  } | null
  currentScore?: number     // existing score_weight when no preview yet
}

const TIER_BADGE_CLS: Record<VolumeTierName, string> = {
  standard:    '',
  significant: 'bg-blue-100 text-blue-700 border-blue-200',
  substantial: 'bg-purple-100 text-purple-700 border-purple-200',
  massive:     'bg-amber-100 text-amber-800 border-amber-300',
}

export default function ScoringClassification({
  configs,
  taskType,
  complexity,
  onTypeChange,
  onComplexityChange,
  locked = false,
  lockedReason,
  preview,
  currentScore,
}: Props) {
  const taskTypes = configs.filter(c => c.category === 'task_type')
  // Hide volume tier/bonus rows — they live in admin settings, not as user-pickable
  // complexity options. They share the 'complexity' category for grouping in admin UI.
  const complexities = configs.filter(c => c.category === 'complexity' && !c.config_key.startsWith('volume_'))

  const borderCls = locked ? 'border-amber-100 bg-amber-50/20' : 'border-blue-100 bg-blue-50/30'

  return (
    <div className={`border rounded-xl p-4 space-y-4 ${borderCls}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Scoring Classification</p>
        {locked ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
            <Lock size={11} /> {lockedReason ?? 'Locked after completion'}
          </span>
        ) : preview ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1.5 bg-white border border-blue-200 rounded-lg px-3 py-1.5">
              <Zap size={13} className="text-blue-500" />
              <span className="text-sm font-bold text-blue-700">{preview.potential} pts</span>
              <span className="text-xs text-gray-400">· up to {preview.max} early</span>
            </div>
            {preview.volumeBonus !== undefined && preview.volumeBonus > 0 && preview.tier && preview.tier.name !== 'standard' && (
              <span className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full border ${TIER_BADGE_CLS[preview.tier.name]}`}>
                <Sparkles size={10} /> {preview.tier.label} +{preview.volumeBonus}
                {typeof preview.subtaskCount === 'number' && (
                  <span className="font-normal text-[10px] opacity-80">· {preview.subtaskCount} subtasks</span>
                )}
              </span>
            )}
          </div>
        ) : currentScore && currentScore > 0 ? (
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
            <Zap size={13} className="text-gray-400" />
            <span className="text-sm font-bold text-gray-600">{currentScore} pts current</span>
          </div>
        ) : null}
      </div>

      {/* Task Type */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Task Type</p>
        <div className="grid grid-cols-3 gap-2">
          {taskTypes.map(c => {
            const value = c.config_key.replace('task_type_', '')
            const selected = taskType === value
            const ico = icon(c)
            const desc = description(c)

            if (locked) {
              return (
                <div
                  key={c.config_key}
                  className={`flex flex-col gap-1 p-3 rounded-lg border text-center cursor-not-allowed transition-opacity ${
                    selected ? 'border-blue-200 bg-blue-50 opacity-70' : 'border-gray-100 bg-gray-50 opacity-40'
                  }`}
                >
                  <span className="text-xl leading-none">{ico}</span>
                  <span className="text-xs font-semibold text-gray-600 leading-snug">{c.label}</span>
                </div>
              )
            }

            return (
              <button
                key={c.config_key}
                type="button"
                onClick={() => onTypeChange(value)}
                className={`flex flex-col gap-1 p-3 rounded-lg border text-left transition-all ${
                  selected
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-400 ring-offset-1'
                    : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xl leading-none">{ico}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${selected ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                    ×{c.config_value}
                  </span>
                </div>
                <span className="text-xs font-semibold text-gray-800 leading-snug">{c.label}</span>
                {desc && <span className="text-[10px] text-gray-400 leading-snug">{desc}</span>}
              </button>
            )
          })}

          {/* Deleted type placeholder — if task has a type that no longer exists in configs */}
          {taskType && !taskTypes.find(c => c.config_key.replace('task_type_', '') === taskType) && (
            <div className="flex flex-col gap-1 p-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 opacity-60">
              <div className="flex items-center justify-between">
                <span className="text-xl leading-none">🗑️</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-400">deleted</span>
              </div>
              <span className="text-xs font-semibold text-gray-500 leading-snug">{taskType}</span>
              <span className="text-[10px] text-gray-400">Score calculated on old weight</span>
            </div>
          )}
        </div>
      </div>

      {/* Complexity */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Complexity</p>
        <div className="grid grid-cols-3 gap-2">
          {complexities.map(c => {
            const value = c.config_key.replace('complexity_', '')
            const selected = complexity === value
            const ico = icon(c)
            const desc = description(c)

            if (locked) {
              return (
                <div
                  key={c.config_key}
                  className={`flex flex-col gap-1 p-3 rounded-lg border text-center cursor-not-allowed transition-opacity ${
                    selected ? 'border-blue-200 bg-blue-50 opacity-70' : 'border-gray-100 bg-gray-50 opacity-40'
                  }`}
                >
                  <span className="text-xl leading-none">{ico}</span>
                  <span className="text-xs font-semibold text-gray-600 leading-snug">{c.label}</span>
                </div>
              )
            }

            return (
              <button
                key={c.config_key}
                type="button"
                onClick={() => onComplexityChange(value)}
                className={`flex flex-col gap-1 p-3 rounded-lg border text-left transition-all ${
                  selected
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-400 ring-offset-1'
                    : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xl leading-none">{ico}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${selected ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                    ×{c.config_value}
                  </span>
                </div>
                <span className="text-xs font-semibold text-gray-800 leading-snug">{c.label}</span>
                {desc && <span className="text-[10px] text-gray-400 leading-snug">{desc}</span>}
              </button>
            )
          })}

          {/* Deleted complexity placeholder */}
          {complexity && !complexities.find(c => c.config_key.replace('complexity_', '') === complexity) && (
            <div className="flex flex-col gap-1 p-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 opacity-60">
              <div className="flex items-center justify-between">
                <span className="text-xl leading-none">🗑️</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-400">deleted</span>
              </div>
              <span className="text-xs font-semibold text-gray-500 leading-snug">{complexity}</span>
              <span className="text-[10px] text-gray-400">Score calculated on old weight</span>
            </div>
          )}
        </div>
      </div>

      {!locked && !taskType && !complexity && (
        <p className="text-xs text-gray-400 text-center">Select a type and complexity to see your potential score</p>
      )}
    </div>
  )
}
