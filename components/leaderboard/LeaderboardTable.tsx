import { cn } from '@/lib/utils'
import RankBadge from './RankBadge'

export interface LeaderboardRow {
  user_id: string
  full_name: string
  avatar_url: string | null
  department: string | null
  designation: string | null
  score_earned: number
  score_possible: number
  completion_rate: number
  bonus_points: number
  rank: number
}

interface Props {
  rows: LeaderboardRow[]
  currentUserId: string
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function LeaderboardTable({ rows, currentUserId }: Props) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="font-medium">No data yet for this month</p>
        <p className="text-sm mt-1">Scores are calculated once tasks are completed</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {rows.map(row => {
        const isMe = row.user_id === currentUserId
        const pct = row.score_possible > 0
          ? Math.min(100, (row.score_earned / row.score_possible) * 100)
          : 0

        return (
          <div
            key={row.user_id}
            className={cn(
              'flex items-center gap-4 p-4 rounded-xl border transition-colors',
              isMe
                ? 'bg-blue-50 border-blue-200'
                : 'bg-white border-gray-200 hover:border-gray-300'
            )}
          >
            <RankBadge rank={row.rank} />

            <div className="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden">
              {row.avatar_url ? (
                <img
                  src={row.avatar_url}
                  alt={row.full_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                  {initials(row.full_name)}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={cn('text-sm font-semibold truncate', isMe ? 'text-blue-700' : 'text-gray-900')}>
                  {row.full_name}
                  {isMe && <span className="ml-1 text-xs font-normal text-blue-500">(you)</span>}
                </p>
              </div>
              {(row.designation || row.department) && (
                <p className="text-xs text-gray-400">
                  {[row.designation, row.department].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-32">
                  <div
                    className={cn('h-full rounded-full', row.rank === 1 ? 'bg-yellow-400' : row.rank === 2 ? 'bg-gray-400' : row.rank === 3 ? 'bg-orange-400' : 'bg-blue-400')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{Number(row.completion_rate).toFixed(0)}%</span>
              </div>
            </div>

            <div className="text-right flex-shrink-0">
              <p className="text-lg font-bold text-gray-900">{row.score_earned + (row.bonus_points ?? 0)}</p>
              <p className="text-xs text-gray-400">/ {row.score_possible} pts</p>
              {(row.bonus_points ?? 0) > 0 && (
                <p className="text-xs text-amber-600 font-medium">+{row.bonus_points} 🏅</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
