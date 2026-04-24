import { formatDate } from '@/lib/utils'
import { computeBadges } from '@/lib/scoring'
import { Trophy, Target, TrendingUp, Award, ClipboardList, Lightbulb, BarChart2, CalendarCheck } from 'lucide-react'
import type { AppraisalSnapshot, Profile, MonthlyScore, CategoryStat, Task, UserAward } from '@/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function ratingBand(avg: number): { label: string; color: string } {
  if (avg >= 90) return { label: 'Exceptional', color: 'text-green-700' }
  if (avg >= 75) return { label: 'Exceeds Expectations', color: 'text-blue-700' }
  if (avg >= 60) return { label: 'Meets Expectations', color: 'text-yellow-700' }
  if (avg >= 45) return { label: 'Needs Improvement', color: 'text-orange-700' }
  return { label: 'Underperforming', color: 'text-red-700' }
}

interface Props {
  snapshot: AppraisalSnapshot
  profile: Profile
  monthlyScores: MonthlyScore[]
  categoryStats: CategoryStat[]
  tasks?: Task[]
  awards?: UserAward[]
  attendanceLeaves?: Array<{ date: string; leave_type: string }>
}

export default function PrintableAppraisal({ snapshot, profile, monthlyScores, categoryStats, tasks, awards, attendanceLeaves }: Props) {
  const rating = ratingBand(Number(snapshot.avg_monthly_score))
  const maxScore = Math.max(...monthlyScores.map(s => s.score_earned), 1)
  const avgCompletion = monthlyScores.length 
    ? monthlyScores.reduce((acc, s) => acc + Number(s.completion_rate), 0) / monthlyScores.length 
    : 0
  
  const badges = computeBadges(monthlyScores).filter(b => b.earned)

  return (
    <div className="bg-white p-10 max-w-4xl mx-auto text-gray-900 font-sans print:p-8 print:max-w-none">
      {/* Header Section */}
      <div className="flex items-start justify-between border-b-4 border-blue-600 pb-6 mb-8">
        <div className="flex gap-5 items-center">
          {profile.avatar_url ? (
            <img 
              src={profile.avatar_url} 
              alt={profile.full_name} 
              className="w-20 h-20 rounded-full object-cover border-2 border-gray-100 shadow-sm"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold shadow-sm">
              {profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">{profile.full_name}</h1>
            <p className="text-lg font-medium text-blue-600">{profile.designation || 'Team Member'}</p>
            <div className="flex gap-4 mt-1 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Target size={14} /> {profile.department || 'Marketing'}
              </span>
              {profile.joining_date && (
                <span className="flex items-center gap-1">
                  <ClipboardList size={14} /> Joined {formatDate(profile.joining_date)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-xl font-black uppercase tracking-wider ${rating.color}`}>
            {rating.label}
          </div>
          <p className="text-sm text-gray-400 mt-1">Financial Year {snapshot.financial_year}</p>
          {snapshot.published_at && (
            <p className="text-xs text-gray-400">Generated on {formatDate(snapshot.published_at)}</p>
          )}
        </div>
      </div>

      {/* Key Performance Dashboard */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-center">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Annual Score</p>
          <p className="text-2xl font-black text-blue-700">{snapshot.total_score}</p>
          {snapshot.award_bonus > 0 && (
            <p className="text-[10px] text-amber-600 font-medium mt-0.5">+{snapshot.award_bonus} 🏅 award bonus</p>
          )}
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-center">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Avg Monthly</p>
          <p className="text-2xl font-black text-purple-700">{Number(snapshot.avg_monthly_score).toFixed(1)}</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-center">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Avg Completion</p>
          <p className="text-2xl font-black text-green-700">{avgCompletion.toFixed(1)}%</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-center">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Peak Month</p>
          <p className="text-2xl font-black text-orange-600">{snapshot.peak_month || 'N/A'}</p>
        </div>
      </div>

      {/* Monthly Growth Chart & Badges side by side */}
      <div className="grid grid-cols-3 gap-8 mb-10 break-inside-avoid">
        <div className="col-span-2">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-blue-600" /> Monthly Performance Trend
          </h3>
          <div className="flex items-end gap-2 h-32 px-2 border-b border-gray-100 pb-2">
            {monthlyScores.map(s => {
              const pct = (s.score_earned / maxScore) * 100
              return (
                <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-gray-400">{s.score_earned}</span>
                  <div
                    className="w-full bg-blue-600 rounded-t-sm"
                    style={{ height: `${Math.max(4, pct * 0.8)}px` }}
                  />
                  <span className="text-[10px] font-bold text-gray-500 uppercase">{MONTHS[s.month - 1]}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Award size={16} className="text-orange-500" /> Recognition
          </h3>
          <div className="space-y-3">
            {badges.length > 0 ? badges.map(badge => (
              <div key={badge.key} className="flex items-center gap-3 bg-orange-50/50 p-2 rounded-lg border border-orange-100">
                <span className="text-xl">{badge.emoji}</span>
                <div>
                  <p className="text-xs font-bold text-orange-800">{badge.label}</p>
                  <p className="text-[10px] text-orange-600">{badge.description}</p>
                </div>
              </div>
            )) : (
              <p className="text-xs text-gray-400 italic">No special badges earned this cycle.</p>
            )}
          </div>
        </div>
      </div>

      {/* Competency Breakdown */}
      <div className="mb-10 break-inside-avoid">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2">
          <ClipboardList size={16} className="text-green-600" /> Competency Breakdown
        </h3>
        <div className="grid grid-cols-2 gap-x-12 gap-y-4">
          {categoryStats.map(stat => (
            <div key={stat.category} className="space-y-1">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-gray-700">{stat.category}</span>
                <span className="text-gray-500">{stat.completion_rate}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div 
                  className="bg-green-500 h-1.5 rounded-full" 
                  style={{ width: `${stat.completion_rate}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>{stat.task_count} tasks</span>
                <span>{stat.score_earned} / {stat.score_possible} pts</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Awards & Recognition */}
      {awards && awards.length > 0 && (
        <div className="mb-10 break-inside-avoid">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Trophy size={16} className="text-amber-500" /> Awards & Recognition
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {awards.map(award => {
              const at = award.award_types
              return (
                <div key={award.id} className="flex items-start gap-3 bg-amber-50/50 border border-amber-100 rounded-xl p-3">
                  <span className="text-2xl flex-shrink-0">{at?.icon ?? '🏅'}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-amber-900">{at?.name ?? 'Award'}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 font-bold">+{award.bonus_points} pts</span>
                      <span className="text-[10px] text-gray-400">{MONTHS[award.month - 1]} {award.year}</span>
                    </div>
                    {award.note && <p className="text-[10px] text-amber-700 mt-1 italic">"{award.note}"</p>}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-2 text-right">
            Total award bonus: +{awards.reduce((s, a) => s + a.bonus_points, 0)} pts across {awards.length} award{awards.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {/* AI Analysis Section */}
      <div className="grid grid-cols-2 gap-8 mb-10 break-inside-avoid">
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Target size={16} className="text-blue-600" /> Performance Summary
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed italic border-l-4 border-blue-200 pl-4">
              "{snapshot.ai_summary}"
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold text-green-700 uppercase tracking-tighter mb-2">Key Strengths</p>
              <ul className="space-y-1.5">
                {(snapshot.ai_strengths as string[] || []).map((s, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <span className="text-green-500 font-bold mt-0.5">✓</span> {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold text-orange-700 uppercase tracking-tighter mb-2">Growth Areas</p>
              <ul className="space-y-1.5">
                {(snapshot.ai_areas_of_improvement as string[] || []).map((s, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <span className="text-orange-400 font-bold mt-0.5">→</span> {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        
        <div className="bg-blue-50/30 border border-blue-100 rounded-2xl p-6">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Lightbulb size={16} className="text-yellow-500" /> Development Roadmap
          </h3>
          <ul className="space-y-4">
            {(snapshot.ai_development_roadmap as string[] || []).map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold flex-shrink-0">
                  {i + 1}
                </span>
                <p className="text-xs text-gray-700 font-medium leading-normal">{step}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Task Classification Breakdown */}
      {tasks && tasks.length > 0 && (() => {
        const typeCounts = { monthly_task: 0, new_implementation: 0, ai: 0 }
        const complexityCounts = { easy: 0, medium: 0, difficult: 0 }
        for (const t of tasks) {
          if (t.task_type && t.task_type in typeCounts) typeCounts[t.task_type as keyof typeof typeCounts]++
          if (t.complexity && t.complexity in complexityCounts) complexityCounts[t.complexity as keyof typeof complexityCounts]++
        }
        const total = tasks.length
        const typeEntries: [string, string, number][] = [
          ['🔁', 'Monthly Task', typeCounts.monthly_task],
          ['🚀', 'New Implementation', typeCounts.new_implementation],
          ['🤖', 'AI', typeCounts.ai],
        ]
        const complexityEntries: [string, string, number][] = [
          ['🟢', 'Easy', complexityCounts.easy],
          ['🟡', 'Medium', complexityCounts.medium],
          ['🔴', 'Difficult', complexityCounts.difficult],
        ]
        return (
          <div className="mb-10 break-inside-avoid">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2">
              <BarChart2 size={16} className="text-purple-600" /> Task Classification
            </h3>
            <div className="grid grid-cols-2 gap-x-12 gap-y-2">
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">By Task Type</p>
                <div className="space-y-2">
                  {typeEntries.filter(([, , n]) => n > 0).map(([icon, label, count]) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-gray-700">{icon} {label}</span>
                        <span className="text-gray-400">{count} / {total}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${(count / total) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">By Complexity</p>
                <div className="space-y-2">
                  {complexityEntries.filter(([, , n]) => n > 0).map(([icon, label, count]) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-gray-700">{icon} {label}</span>
                        <span className="text-gray-400">{count} / {total}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${(count / total) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Attendance & Punctuality */}
      {(() => {
        const leaves = attendanceLeaves ?? []
        const sickCount   = leaves.filter(l => l.leave_type === 'sick').length
        const casualCount = leaves.filter(l => l.leave_type === 'casual').length
        const monthsWithLeaves = new Set(leaves.map(l => l.date.slice(0, 7))).size
        const perfectMonths = 12 - monthsWithLeaves
        const attendanceBonus = (awards ?? []).filter(a => a.award_types?.name === 'Perfect Attendance')
          .reduce((s, a) => s + a.bonus_points, 0)

        // Build monthly grid: Apr=4 to Mar=3 of next FY
        const [fyStartStr, fyEndShort] = snapshot.financial_year.split('-')
        const fyStartYear = parseInt(fyStartStr)
        const fyEndYear   = 2000 + parseInt(fyEndShort)
        const fyMonths = [
          { m: 4, y: fyStartYear }, { m: 5, y: fyStartYear }, { m: 6, y: fyStartYear },
          { m: 7, y: fyStartYear }, { m: 8, y: fyStartYear }, { m: 9, y: fyStartYear },
          { m: 10, y: fyStartYear }, { m: 11, y: fyStartYear }, { m: 12, y: fyStartYear },
          { m: 1, y: fyEndYear }, { m: 2, y: fyEndYear }, { m: 3, y: fyEndYear },
        ]
        const monthKeys = new Set(leaves.map(l => l.date.slice(0, 7)))

        return (
          <div className="mb-10 break-inside-avoid">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest mb-4 flex items-center gap-2">
              <CalendarCheck size={16} className="text-teal-600" /> Attendance & Punctuality
            </h3>
            <div className="bg-teal-50/30 border border-teal-100 rounded-2xl p-5">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{leaves.length}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Total Leaves</p>
                  <p className="text-[10px] text-gray-400">{sickCount} sick · {casualCount} casual</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-teal-700">{perfectMonths} <span className="text-sm font-medium text-gray-400">/ 12</span></p>
                  <p className="text-xs text-gray-500 mt-0.5">Perfect Months</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-teal-600">+{attendanceBonus}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Attendance Bonus</p>
                  <p className="text-[10px] text-gray-400">pts earned</p>
                </div>
              </div>

              {/* Monthly grid */}
              <div className="flex gap-1.5 flex-wrap mb-4">
                {fyMonths.map(({ m, y }) => {
                  const key = `${y}-${m.toString().padStart(2, '0')}`
                  const hasLeave = monthKeys.has(key)
                  return (
                    <div
                      key={key}
                      title={`${MONTHS[m - 1]} ${y} — ${hasLeave ? 'Leave taken' : 'Perfect attendance'}`}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                        hasLeave ? 'bg-orange-100 text-orange-600' : 'bg-teal-100 text-teal-700'
                      }`}
                    >
                      {MONTHS[m - 1].slice(0, 1)}
                      <span className="ml-0.5">{hasLeave ? '●' : '✓'}</span>
                    </div>
                  )
                })}
              </div>

              {/* AI insight */}
              {snapshot.ai_attendance_insight && (
                <div className="border-t border-teal-100 pt-3">
                  <p className="text-[10px] font-bold text-teal-600 uppercase tracking-widest mb-1">AI Insight</p>
                  <p className="text-xs text-gray-700 leading-relaxed italic">{snapshot.ai_attendance_insight}</p>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Signature block */}
      <div className="mt-12 pt-8 border-t-2 border-gray-100 grid grid-cols-2 gap-12">
        <div>
          <div className="h-16 border-b border-gray-300 mb-2 relative">
            <span className="absolute bottom-2 left-0 text-[10px] text-gray-300 uppercase font-bold tracking-widest">Digital Signature Space</span>
          </div>
          <p className="text-xs font-bold text-gray-900">{profile.full_name}</p>
          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Employee Signature & Date</p>
        </div>
        <div>
          <div className="h-16 border-b border-gray-300 mb-2 relative">
             <span className="absolute bottom-2 left-0 text-[10px] text-gray-300 uppercase font-bold tracking-widest">Authorized Signatory</span>
          </div>
          <p className="text-xs font-bold text-gray-900">Department Head / Manager</p>
          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Manager Signature & Date</p>
        </div>
      </div>
      
      {/* Footer Branding */}
      <div className="mt-12 pt-4 border-t border-gray-50 flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase tracking-widest">
        <span>Edstellar Marketing Intelligence System</span>
        <span>Confidential - For Internal Use Only</span>
      </div>
    </div>
  )
}
