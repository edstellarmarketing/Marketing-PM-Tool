'use client'

import { Trophy } from 'lucide-react'

interface Props {
  awardIcon?: string | null
  awardName?: string | null
  totalPoints: number
}

/**
 * Compact reward pill used in the /dashboard widget and as a slim badge on task
 * rows / "My accepted" entries. Always shows the total points; award name is
 * optional (renders generic "Bonus" if not provided).
 */
export default function RewardChip({ awardIcon, awardName, totalPoints }: Props) {
  return (
    <div className="inline-flex items-center gap-2">
      <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl flex-shrink-0 text-white shadow-sm bg-gradient-to-br from-amber-500 to-amber-700 dark:from-amber-400 dark:to-amber-600">
        <span className="text-xl font-extrabold leading-none">{totalPoints}</span>
        <span className="text-[9px] tracking-widest mt-0.5">PTS</span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200 truncate flex items-center gap-1">
          {awardIcon
            ? <span aria-hidden>{awardIcon}</span>
            : <Trophy size={12} className="text-amber-600 dark:text-amber-400" />}
          <span className="truncate">{awardName ?? 'Bonus reward'}</span>
        </p>
      </div>
    </div>
  )
}
