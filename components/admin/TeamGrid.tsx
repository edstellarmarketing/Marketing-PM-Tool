import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Profile, MonthlyScore } from '@/types'

interface MemberRow {
  profile: Profile
  score: MonthlyScore | null
}

interface Props {
  members: MemberRow[]
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function ratingColor(rate: number) {
  if (rate >= 90) return 'text-green-600 bg-green-50'
  if (rate >= 70) return 'text-blue-600 bg-blue-50'
  if (rate >= 50) return 'text-orange-600 bg-orange-50'
  return 'text-red-600 bg-red-50'
}

export default function TeamGrid({ members }: Props) {
  if (members.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-8">No team members yet. Invite someone to get started.</p>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {members.map(({ profile, score }) => {
        const rate = score?.completion_rate ?? 0
        return (
          <Link
            key={profile.id}
            href={`/admin/users/${profile.id}`}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm hover:border-blue-300 transition-all group"
          >
            <div className="flex items-start gap-3">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.full_name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                  {initials(profile.full_name)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 group-hover:text-blue-600 truncate">{profile.full_name}</p>
                {profile.designation && <p className="text-xs text-gray-600 mt-0.5 truncate">{profile.designation}</p>}
                <p className="text-xs text-gray-400 mt-0.5">{profile.department ?? 'Marketing'}</p>
              </div>
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0', profile.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600')}>
                {profile.role}
              </span>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs text-gray-500">
                <span>{score?.score_earned ?? 0} pts earned</span>
                <span className={cn('px-2 py-0.5 rounded-full font-medium', ratingColor(Number(rate)))}>
                  {Number(rate).toFixed(0)}% completion
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${Math.min(100, Number(rate))}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>{score?.completed_tasks ?? 0}/{score?.total_tasks ?? 0} tasks</span>
                {score?.rank && <span>Rank #{score.rank}</span>}
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
