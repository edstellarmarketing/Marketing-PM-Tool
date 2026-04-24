import type { MonthlyScore, PointConfig } from '@/types'

// ─── Volume-adjusted scoring ────────────────────────────────────────────────

export interface VolumeTiers {
  significantThreshold: number
  substantialThreshold: number
  massiveThreshold: number
  significantBonus: number
  substantialBonus: number
  massiveBonus: number
}

export const DEFAULT_VOLUME_TIERS: VolumeTiers = {
  significantThreshold: 4,
  substantialThreshold: 8,
  massiveThreshold: 16,
  significantBonus: 0.2,
  substantialBonus: 0.5,
  massiveBonus: 1.0,
}

export type VolumeTierName = 'standard' | 'significant' | 'substantial' | 'massive'

export interface VolumeTier {
  name: VolumeTierName
  bonus: number
  label: string
}

const TIER_LABELS: Record<VolumeTierName, string> = {
  standard:    'Standard',
  significant: 'Significant',
  substantial: 'Substantial',
  massive:     'Mega',
}

export function volumeTiersFromConfig(configs: PointConfig[]): VolumeTiers {
  const get = (k: string, d: number) => {
    const v = configs.find(c => c.config_key === k)?.config_value
    return typeof v === 'number' ? v : d
  }
  return {
    significantThreshold: get('volume_threshold_significant', DEFAULT_VOLUME_TIERS.significantThreshold),
    substantialThreshold: get('volume_threshold_substantial', DEFAULT_VOLUME_TIERS.substantialThreshold),
    massiveThreshold:     get('volume_threshold_massive',     DEFAULT_VOLUME_TIERS.massiveThreshold),
    significantBonus:     get('volume_bonus_significant',     DEFAULT_VOLUME_TIERS.significantBonus),
    substantialBonus:     get('volume_bonus_substantial',     DEFAULT_VOLUME_TIERS.substantialBonus),
    massiveBonus:         get('volume_bonus_massive',         DEFAULT_VOLUME_TIERS.massiveBonus),
  }
}

export function volumeTierFor(count: number, tiers: VolumeTiers = DEFAULT_VOLUME_TIERS): VolumeTier {
  if (count >= tiers.massiveThreshold)     return { name: 'massive',     bonus: tiers.massiveBonus,     label: TIER_LABELS.massive }
  if (count >= tiers.substantialThreshold) return { name: 'substantial', bonus: tiers.substantialBonus, label: TIER_LABELS.substantial }
  if (count >= tiers.significantThreshold) return { name: 'significant', bonus: tiers.significantBonus, label: TIER_LABELS.significant }
  return { name: 'standard', bonus: 0, label: TIER_LABELS.standard }
}

export interface ScorePreview {
  potential: number
  max: number
  typeWeight: number
  complexityWeight: number
  volumeBonus: number
  tier: VolumeTier
  subtaskCount: number
}

export function computeScorePreview(
  configs: PointConfig[],
  taskType: string,
  complexity: string,
  subtaskCount: number = 0,
): ScorePreview | null {
  if (!taskType || !complexity) return null
  const tw = configs.find(c => c.config_key === `task_type_${taskType}`)?.config_value ?? 1
  const cw = configs.find(c => c.config_key === `complexity_${complexity}`)?.config_value ?? 1
  const bm = configs.find(c => c.config_key === 'deadline_before_multiplier')?.config_value ?? 1.5
  const tiers = volumeTiersFromConfig(configs)
  const tier = volumeTierFor(subtaskCount, tiers)
  const adjusted = cw + tier.bonus
  return {
    potential: Math.round(10 * tw * adjusted * 100) / 100,
    max:       Math.round(10 * tw * adjusted * bm * 100) / 100,
    typeWeight: tw,
    complexityWeight: cw,
    volumeBonus: tier.bonus,
    tier,
    subtaskCount,
  }
}

// ─── Monthly score utilities ────────────────────────────────────────────────


export function computeStreak(scores: MonthlyScore[]): number {
  // Sort descending by year/month, count consecutive months with completion_rate >= 80
  const sorted = [...scores].sort((a, b) =>
    b.year !== a.year ? b.year - a.year : b.month - a.month
  )
  let streak = 0
  for (const s of sorted) {
    if (Number(s.completion_rate) >= 80) streak++
    else break
  }
  return streak
}

export interface Badge {
  key: string
  label: string
  description: string
  emoji: string
  earned: boolean
}

export function computeBadges(scores: MonthlyScore[]): Badge[] {
  const hasPerfect = scores.some(s => Number(s.completion_rate) >= 100)
  const streak = computeStreak(scores)
  const hasConsistent = streak >= 3

  const sorted = [...scores].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  )
  let maxImprovement = 0
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i].score_earned - sorted[i - 1].score_earned
    if (diff > maxImprovement) maxImprovement = diff
  }
  const hasMostImproved = maxImprovement >= 0.5

  return [
    {
      key: 'perfect_month',
      label: 'Perfect Month',
      description: '100% completion in a month',
      emoji: '🏆',
      earned: hasPerfect,
    },
    {
      key: 'consistent',
      label: 'Consistent Performer',
      description: '3+ consecutive months above 80%',
      emoji: '🔥',
      earned: hasConsistent,
    },
    {
      key: 'most_improved',
      label: 'Most Improved',
      description: 'Month-over-month score improvement of 0.5+ pts',
      emoji: '📈',
      earned: hasMostImproved,
    },
  ]
}
