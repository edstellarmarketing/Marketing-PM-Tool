'use client'

import { Trophy } from 'lucide-react'

interface Props {
  awardIcon?: string | null
  awardName?: string | null
  taskPoints: number       // score_weight (resolved — pass 0 if not yet calculated)
  bonusPoints: number
  /** Compact variant for "My accepted" — slimmer, no animation, lower opacity. */
  variant?: 'hero' | 'slim'
  showAnimation?: boolean
}

export default function RewardStrip({
  awardIcon, awardName, taskPoints, bonusPoints,
  variant = 'hero', showAnimation = true,
}: Props) {
  const total = (taskPoints ?? 0) + (bonusPoints ?? 0)
  if (total === 0 && !awardName) return null

  const isHero = variant === 'hero'

  return (
    <div
      className={[
        'flex items-center justify-between gap-3 rounded-lg overflow-hidden',
        'bg-gradient-to-r from-amber-100 via-amber-50 to-yellow-100',
        'dark:from-amber-950/60 dark:via-amber-900/40 dark:to-yellow-900/40',
        'border border-amber-200/80 dark:border-amber-800/60',
        isHero ? 'px-4 py-3' : 'px-3 py-2 opacity-90',
        isHero && showAnimation ? 'animate-pulse-once' : '',
      ].join(' ')}
      style={isHero && showAnimation ? { animation: 'pulse-once 1.6s ease-out 1' } : undefined}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={isHero ? 'text-3xl leading-none' : 'text-xl leading-none'} aria-hidden>
          {awardIcon || (
            <Trophy className="text-amber-600 dark:text-amber-400" size={isHero ? 28 : 18} />
          )}
        </div>
        <div className="min-w-0">
          <p
            className={[
              'font-bold uppercase tracking-wide truncate text-amber-900 dark:text-amber-200',
              isHero ? 'text-sm' : 'text-[11px]',
            ].join(' ')}
          >
            {awardName || 'Bonus reward'}
          </p>
          {isHero && (
            <p className="text-[10px] uppercase tracking-wider text-amber-700/80 dark:text-amber-300/80">
              Award
            </p>
          )}
          {isHero && (
            <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
              {taskPoints > 0 ? `${taskPoints} task pts  +  ${bonusPoints} bonus pts` : `${bonusPoints} bonus pts`}
            </p>
          )}
        </div>
      </div>

      <div
        className={[
          'flex flex-col items-center justify-center rounded-lg flex-shrink-0 text-white shadow-sm',
          'bg-gradient-to-br from-amber-500 to-amber-700 dark:from-amber-400 dark:to-amber-600',
          isHero ? 'w-20 h-20 px-2' : 'w-14 h-12 px-2',
        ].join(' ')}
      >
        <span className={isHero ? 'text-3xl font-extrabold leading-none' : 'text-xl font-extrabold leading-none'}>
          {total}
        </span>
        <span className={isHero ? 'text-[10px] tracking-widest mt-1' : 'text-[9px] tracking-widest mt-0.5'}>
          {isHero ? 'POINTS' : 'PTS'}
        </span>
      </div>

      {/* one-shot pulse keyframe, scoped */}
      <style jsx>{`
        @keyframes pulse-once {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(217,119,6,0); }
          50% { transform: scale(1.01); box-shadow: 0 0 16px 2px rgba(217,119,6,0.25); }
        }
      `}</style>
    </div>
  )
}
