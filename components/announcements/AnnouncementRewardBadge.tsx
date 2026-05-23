import { Megaphone, Trophy } from 'lucide-react'

export interface AnnouncementReward {
  awardName: string | null
  awardIcon: string | null
  bonusPoints: number
  taskPoints: number      // copied from announcement.score_weight or live task.score_weight
  status: 'pending' | 'granted'   // 'granted' = task already approved
}

interface Props {
  reward: AnnouncementReward
  /** Show the +N pts on completion wording (default true). */
  showWording?: boolean
}

/**
 * Inline pill rendered on task rows that came from an announcement.
 * Pairs with the gold left-edge ribbon to differentiate from regular tasks.
 */
export default function AnnouncementRewardBadge({ reward, showWording = true }: Props) {
  const total = (reward.taskPoints ?? 0) + (reward.bonusPoints ?? 0)
  const wording = reward.status === 'granted' ? 'pts granted' : 'pts on approval'
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/50 whitespace-nowrap">
      {reward.awardIcon ? (
        <span aria-hidden>{reward.awardIcon}</span>
      ) : (
        <Trophy size={10} className="text-amber-600 dark:text-amber-400" />
      )}
      <span className="truncate max-w-[140px]">{reward.awardName ?? 'Bonus'}</span>
      <span className="font-bold">· +{total} {showWording ? wording : 'pts'}</span>
    </span>
  )
}

/** Left-edge ribbon (4px) for announcement-sourced rows. */
export function AnnouncementRibbon({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 to-amber-600 ${className}`}
      title="Announcement-sourced task"
    >
      <Megaphone className="absolute top-1/2 -translate-y-1/2 -translate-x-[2px] text-amber-700 dark:text-amber-300 hidden lg:block" size={10} />
    </span>
  )
}
