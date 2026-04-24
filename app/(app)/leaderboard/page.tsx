import { createClient } from '@/lib/supabase/server'
import { Suspense } from 'react'
import MonthSelector from '@/components/plans/MonthSelector'
import LeaderboardTable from '@/components/leaderboard/LeaderboardTable'
import ScoreHistoryChart from '@/components/leaderboard/ScoreHistoryChart'
import RankBadge from '@/components/leaderboard/RankBadge'
import { computeStreak, computeBadges } from '@/lib/scoring'
import type { MonthlyScore, UserAward } from '@/types'
import type { LeaderboardRow } from '@/components/leaderboard/LeaderboardTable'

const MONTHS_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface Props {
  searchParams: Promise<{ month?: string; year?: string }>
}

export default async function LeaderboardPage({ searchParams }: Props) {
  const params = await searchParams
  const now = new Date()
  const month = parseInt(params.month ?? String(now.getMonth() + 1))
  const year = parseInt(params.year ?? String(now.getFullYear()))

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [leaderboardRes, myScoresRes, myScoreRes, myTasksRes, allAwardsRes] = await Promise.all([
    supabase.rpc('get_leaderboard', { p_month: month, p_year: year }),
    supabase.from('monthly_scores').select('*').eq('user_id', user!.id).order('year').order('month'),
    supabase.from('monthly_scores').select('*').eq('user_id', user!.id).eq('month', month).eq('year', year).single(),
    supabase.from('tasks').select('task_type,complexity,status,score_earned,score_weight')
      .eq('user_id', user!.id).eq('status', 'done').eq('is_draft', false),
    supabase.from('user_awards').select('*, award_types(id,name,icon,bonus_points)').order('created_at', { ascending: false }),
  ])

  const rows = (leaderboardRes.data ?? []) as LeaderboardRow[]
  const myScores = (myScoresRes.data ?? []) as MonthlyScore[]
  const myScore = myScoreRes.data as MonthlyScore | null
  const myDoneTasks = (myTasksRes.data ?? []) as { task_type: string | null; complexity: string | null; status: string; score_earned: number; score_weight: number }[]
  const allAwards = (allAwardsRes.data ?? []) as UserAward[]

  // Fetch profiles for all award recipients
  const spotlightAwards = allAwards.slice(0, 5)
  const awardUserIds = [...new Set(allAwards.map(a => a.user_id))]
  const { data: awardProfiles } = awardUserIds.length > 0
    ? await supabase.from('profiles').select('id,full_name,avatar_url').in('id', awardUserIds)
    : { data: [] }
  const awardProfileMap = Object.fromEntries((awardProfiles ?? []).map((p: { id: string; full_name: string; avatar_url: string | null }) => [p.id, p]))

  // Type breakdown for done tasks
  const typeBreakdown: Record<string, number> = {}
  for (const t of myDoneTasks) {
    if (t.task_type) typeBreakdown[t.task_type] = (typeBreakdown[t.task_type] ?? 0) + 1
  }
  const typeEntries = [
    { key: 'monthly_task', label: '🔁', short: 'Monthly' },
    { key: 'new_implementation', label: '🚀', short: 'New Impl.' },
    { key: 'ai', label: '🤖', short: 'AI' },
  ].filter(e => typeBreakdown[e.key] > 0)

  const streak = computeStreak(myScores)
  const badges = computeBadges(myScores)
  const earnedBadges = badges.filter(b => b.earned)

  const myRank = rows.find(r => r.user_id === user!.id)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leaderboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Monthly team rankings</p>
        </div>
        <Suspense>
          <MonthSelector month={month} year={year} />
        </Suspense>
      </div>

      {/* My rank snapshot */}
      {myScore && (
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">Your rank this month</p>
              <div className="flex items-center gap-3 mt-1">
                {myRank ? <RankBadge rank={myRank.rank} /> : null}
                <span className="text-3xl font-bold">
                  {myRank ? `#${myRank.rank}` : '—'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-blue-100 text-sm">Score</p>
              <p className="text-2xl font-bold">{myScore.score_earned + (myScore.bonus_points ?? 0)} pts</p>
              {(myScore.bonus_points ?? 0) > 0 && (
                <p className="text-blue-200 text-xs">{myScore.score_earned} task + {myScore.bonus_points} 🏅</p>
              )}
              <p className="text-blue-200 text-sm">{Number(myScore.completion_rate).toFixed(0)}% completion</p>
            </div>
            {streak > 0 && (
              <div className="text-center">
                <p className="text-blue-100 text-sm">Streak</p>
                <p className="text-2xl font-bold">🔥 {streak}</p>
                <p className="text-blue-200 text-sm">month{streak !== 1 ? 's' : ''}</p>
              </div>
            )}
          </div>
          {typeEntries.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/20 flex items-center gap-4 flex-wrap">
              <p className="text-blue-100 text-xs font-medium">Tasks done by type:</p>
              {typeEntries.map(e => (
                <span key={e.key} className="text-xs bg-white/20 text-white px-2.5 py-1 rounded-full font-medium">
                  {e.label} {e.short} · {typeBreakdown[e.key]}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Badges */}
      {earnedBadges.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Your Badges</h2>
          <div className="flex flex-wrap gap-3">
            {earnedBadges.map(badge => (
              <div key={badge.key} className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-xl">
                <span className="text-xl">{badge.emoji}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{badge.label}</p>
                  <p className="text-xs text-gray-500">{badge.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rankings + Award Spotlight side by side */}
      <div className="flex gap-5 items-start">
        <div className="flex-1 bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Rankings</h2>
          <LeaderboardTable rows={rows} currentUserId={user!.id} />
        </div>

        {spotlightAwards.length > 0 && (
          <div className="w-56 flex-shrink-0 bg-white border border-amber-200 rounded-xl p-4">
            <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-1.5 text-sm">
              <span>🏅</span> Award Spotlight
            </h2>
            <div className="space-y-4">
              {spotlightAwards.map(award => {
                const profile = awardProfileMap[award.user_id]
                const at = award.award_types
                return (
                  <div key={award.id} className="text-center">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt={profile.full_name} className="w-10 h-10 rounded-full object-cover mx-auto" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold mx-auto">
                        {(profile?.full_name ?? '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                    )}
                    <p className="text-xs font-semibold text-gray-900 mt-1 truncate">{profile?.full_name ?? 'User'}</p>
                    <span className="text-xl">{at?.icon ?? '🏅'}</span>
                    <p className="text-xs text-gray-700 font-medium leading-tight">{at?.name ?? 'Award'}</p>
                    <p className="text-xs text-amber-600 font-bold mt-0.5">+{award.bonus_points} pts · {MONTHS_ABBR[award.month - 1]} {award.year}</p>
                  </div>
                )
              })}
            </div>
            {allAwards.length > 5 && (
              <a href="#all-awards" className="block text-center text-xs text-blue-600 hover:underline mt-3">
                View All Awards ↓
              </a>
            )}
          </div>
        )}
      </div>

      {/* Score history */}
      {myScores.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">My Score History</h2>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-blue-500 inline-block rounded" /> Score</span>
              <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-purple-400 inline-block rounded border-dashed border-t border-purple-400" /> Completion %</span>
            </div>
          </div>
          <ScoreHistoryChart scores={myScores} />
        </div>
      )}

      {/* Full awards table */}
      {allAwards.length > 0 && (
        <div id="all-awards" className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">All Awards</h2>
            <p className="text-xs text-gray-400 mt-0.5">All time · all team members</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left py-3 px-4">User</th>
                  <th className="text-left py-3 px-4">Award</th>
                  <th className="text-left py-3 px-4">Pts</th>
                  <th className="text-left py-3 px-4">Period</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allAwards.map(award => {
                  const profile = awardProfileMap[award.user_id]
                  const at = award.award_types
                  return (
                    <tr key={award.id} className="hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt={profile.full_name} className="w-7 h-7 rounded-full object-cover" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                              {(profile?.full_name ?? '?').split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                          )}
                          <span className="font-medium text-gray-900">{profile?.full_name ?? 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="flex items-center gap-1.5">
                          <span>{at?.icon ?? '🏅'}</span>
                          <span className="text-gray-700">{at?.name ?? 'Award'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-amber-700">+{award.bonus_points}</span>
                      </td>
                      <td className="py-3 px-4 text-gray-400">
                        {MONTHS_ABBR[award.month - 1]} {award.year}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
