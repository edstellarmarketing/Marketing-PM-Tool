import { cn } from '@/lib/utils'

interface Props {
  rank: number
  size?: 'sm' | 'md'
}

export default function RankBadge({ rank, size = 'md' }: Props) {
  const medals: Record<number, { emoji: string; bg: string; text: string }> = {
    1: { emoji: '🥇', bg: 'bg-yellow-100', text: 'text-yellow-800' },
    2: { emoji: '🥈', bg: 'bg-gray-100', text: 'text-gray-700' },
    3: { emoji: '🥉', bg: 'bg-orange-100', text: 'text-orange-700' },
  }

  const medal = medals[rank]
  const sizeClass = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'

  if (medal) {
    return (
      <div className={cn('rounded-full flex items-center justify-center font-bold flex-shrink-0', medal.bg, medal.text, sizeClass)}>
        {medal.emoji}
      </div>
    )
  }

  return (
    <div className={cn('rounded-full flex items-center justify-center font-bold bg-gray-50 text-gray-500 flex-shrink-0', sizeClass)}>
      #{rank}
    </div>
  )
}
