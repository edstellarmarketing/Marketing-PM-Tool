import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import GenerateAppraisalButton from '@/components/admin/GenerateAppraisalButton'
import FYSelector from '@/components/admin/FYSelector'
import AppraisalActions from '@/components/appraisals/AppraisalActions'
import PrintableAppraisal from '@/components/appraisals/PrintableAppraisal'
import { getCurrentFinancialYear } from '@/lib/utils'
import type { Profile, AppraisalSnapshot, MonthlyScore, CategoryStat, Task, UserAward } from '@/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface Props {
  params: Promise<{ userId: string }>
  searchParams: Promise<{ fy?: string }>
}

function ratingBand(avg: number): { label: string; color: string } {
  if (avg >= 90) return { label: 'Exceptional', color: 'bg-green-100 text-green-700' }
  if (avg >= 75) return { label: 'Exceeds Expectations', color: 'bg-blue-100 text-blue-700' }
  if (avg >= 60) return { label: 'Meets Expectations', color: 'bg-yellow-100 text-yellow-700' }
  if (avg >= 45) return { label: 'Needs Improvement', color: 'bg-orange-100 text-orange-700' }
  return { label: 'Underperforming', color: 'bg-red-100 text-red-700' }
}

export default async function AppraisalDetailPage({ params, searchParams }: Props) {
  const { userId } = await params
  const { fy: fyParam } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  if (adminProfile?.role !== 'admin') redirect('/dashboard')

  const currentFy = getCurrentFinancialYear()
  const fy = fyParam ?? currentFy
  const adminClient = createAdminClient()

  // Parse FY range: "2024-25" → Apr 2024 – Mar 2025
  const [fyStartStr, fyEndShort] = fy.split('-')
  const fyStartYear = parseInt(fyStartStr)
  const fyEndYear = 2000 + parseInt(fyEndShort)

  const fyStart = `${fyStartYear}-04-01`
  const fyEnd   = `${fyEndYear}-03-31`

  const [{ data: profile }, { data: allSnapshots }, { data: monthlyStats }, { data: categoryStats }, { data: allTasks }, { data: fyAwardsRaw }, { data: fyAttendanceLeaves }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('appraisal_snapshots').select('*').eq('user_id', userId).order('financial_year', { ascending: false }),
    supabase.from('monthly_scores').select('*').eq('user_id', userId).order('year').order('month'),
    supabase.rpc('get_annual_category_stats', { p_user_id: userId, p_financial_year: fy }),
    supabase.from('tasks').select('id,task_type,complexity,status,due_date,created_at').eq('user_id', userId).eq('is_draft', false),
    adminClient
      .from('user_awards')
      .select('*, award_types(id,name,icon,bonus_points)')
      .eq('user_id', userId)
      .or(`and(year.eq.${fyStartYear},month.gte.4),and(year.eq.${fyEndYear},month.lte.3)`)
      .order('created_at', { ascending: false }),
    adminClient
      .from('attendance_leaves')
      .select('date, leave_type')
      .eq('user_id', userId)
      .gte('date', fyStart)
      .lte('date', fyEnd),
  ])

  if (!profile) notFound()

  const p = profile as Profile
  const snapshots = (allSnapshots ?? []) as AppraisalSnapshot[]
  const snapshot = snapshots.find(s => s.financial_year === fy) ?? null
  const scores = (monthlyStats ?? []) as MonthlyScore[]
  const fyAwards = (fyAwardsRaw ?? []) as UserAward[]

  // Filter scores and tasks to the selected FY (Apr–Mar)
  const fyScores = scores.filter(s =>
    (s.year === fyStartYear && s.month >= 4) ||
    (s.year === fyEndYear && s.month <= 3)
  )
  const fyTasks = ((allTasks ?? []) as Task[]).filter(t => {
    const date = new Date(t.due_date ?? t.created_at)
    const m = date.getUTCMonth() + 1
    const y = date.getUTCFullYear()
    return (y === fyStartYear && m >= 4) || (y === fyEndYear && m <= 3)
  })

  function initials(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <Link href="/admin/appraisals" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={16} /> Back to Appraisals
      </Link>

      {/* Profile + FY selector */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {p.avatar_url ? (
              <img src={p.avatar_url} alt={p.full_name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                {initials(p.full_name)}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-gray-900">{p.full_name}</h1>
              {p.designation && <p className="text-sm font-medium text-gray-700">{p.designation}</p>}
              <p className="text-sm text-gray-500">{p.department ?? 'Marketing'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* FY selector */}
            <FYSelector
              currentFy={fy}
              options={[0, 1, 2, 3].map(i => {
                const yr = parseInt(currentFy.split('-')[0]) - i
                return `${yr}-${String(yr + 1).slice(2)}`
              })}
            />
            <GenerateAppraisalButton userId={userId} financialYear={fy} hasSnapshot={!!snapshot} />
          </div>
        </div>

        {snapshot && (
          <>
            <div className="mt-6 grid grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-blue-700">{snapshot.total_score}</p>
                {snapshot.award_bonus > 0 && (
                  <p className="text-[10px] text-blue-400 mt-0.5">incl. +{snapshot.award_bonus} award bonus</p>
                )}
                <p className="text-xs text-blue-600 mt-1">Total Score</p>
              </div>
              <div className="bg-purple-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-purple-700">{Number(snapshot.avg_monthly_score).toFixed(1)}</p>
                <p className="text-xs text-purple-600 mt-1">Avg Monthly</p>
              </div>
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <p className="text-lg font-bold text-green-700">{snapshot.peak_month ?? '—'}</p>
                <p className="text-xs text-green-600 mt-1">Peak Month</p>
              </div>
              <div className="rounded-xl p-4 text-center bg-gray-50">
                {(() => { const { label, color } = ratingBand(Number(snapshot.avg_monthly_score)); return <><p className={`text-xs font-bold px-2 py-1 rounded-full inline-block ${color}`}>{label}</p><p className="text-xs text-gray-400 mt-2">Rating Band</p></> })()}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${snapshot.published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {snapshot.published ? '✓ Published to member' : 'Draft — not visible to member'}
                </span>
              </div>
              <AppraisalActions
                snapshot={snapshot}
                profile={p}
                monthlyScores={fyScores}
                userId={userId}
                categoryStats={(categoryStats ?? []) as CategoryStat[]}
                tasks={fyTasks}
                awards={fyAwards}
                attendanceLeaves={(fyAttendanceLeaves ?? []) as Array<{ date: string; leave_type: string }>}
              />
            </div>
          </>
        )}
      </div>

      {/* Year-over-year comparison */}
      {snapshots.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Year-over-Year</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left pb-2">FY</th>
                  <th className="text-left pb-2">Total Score</th>
                  <th className="text-left pb-2">Avg Monthly</th>
                  <th className="text-left pb-2">Rating</th>
                  <th className="text-left pb-2">Published</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map(s => {
                  const { label, color } = ratingBand(Number(s.avg_monthly_score))
                  return (
                    <tr key={s.id} className={`border-t border-gray-100 ${s.financial_year === fy ? 'bg-blue-50' : ''}`}>
                      <td className="py-2 font-medium text-gray-900">FY {s.financial_year}</td>
                      <td className="py-2 text-gray-700">{s.total_score}</td>
                      <td className="py-2 text-gray-700">{Number(s.avg_monthly_score).toFixed(1)}</td>
                      <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{label}</span></td>
                      <td className="py-2 text-gray-500">{s.published ? '✓' : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Monthly scores chart */}
      {fyScores.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 mb-4">FY {fy} Monthly Scores</h2>
          <div className="flex items-end gap-2 h-32">
            {fyScores.map(s => {
              const max = Math.max(...fyScores.map(m => m.score_earned), 1)
              const pct = (s.score_earned / max) * 100
              return (
                <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-500">{s.score_earned}</span>
                  <div className="w-full bg-blue-500 rounded-t" style={{ height: `${Math.max(4, pct * 0.9)}px` }} />
                  <span className="text-xs text-gray-400">{MONTHS[s.month - 1]}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Awards & Recognition */}
      {fyAwards.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Awards & Recognition ({fyAwards.length})</h2>
            <span className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1">
              +{fyAwards.reduce((s, a) => s + a.bonus_points, 0)} bonus pts
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {fyAwards.map(award => {
              const at = award.award_types
              return (
                <div key={award.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="text-2xl flex-shrink-0">{at?.icon ?? '🏅'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-gray-900">{at?.name ?? 'Award'}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">+{award.bonus_points} pts</span>
                      <span className="text-xs text-gray-400">{MONTHS[award.month - 1]} {award.year}</span>
                    </div>
                    {award.note && <p className="text-xs text-gray-500 mt-1 italic">"{award.note}"</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* AI Summary */}
      {snapshot?.ai_summary && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">AI Appraisal Summary</h2>
          <p className="text-sm text-gray-700 leading-relaxed border-l-4 border-purple-400 pl-4">{snapshot.ai_summary}</p>

          <div className="grid grid-cols-2 gap-6">
            {snapshot.ai_strengths && snapshot.ai_strengths.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Strengths</h3>
                <ul className="space-y-1.5">
                  {(snapshot.ai_strengths as string[]).map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="text-green-500 mt-0.5">✓</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {snapshot.ai_areas_of_improvement && snapshot.ai_areas_of_improvement.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Areas of Improvement</h3>
                <ul className="space-y-1.5">
                  {(snapshot.ai_areas_of_improvement as string[]).map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="text-orange-400 mt-0.5">→</span>{s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {!snapshot && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-gray-400">
          <p className="font-medium">No appraisal for FY {fy}</p>
          <p className="text-sm mt-1">Click "Generate Appraisal" above to create one with AI</p>
        </div>
      )}

      {/* Full report preview — hidden when printing (AppraisalActions handles the print copy) */}
      {snapshot && (
        <div className="print:hidden">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Report Preview</h2>
          </div>
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <PrintableAppraisal
              snapshot={snapshot as AppraisalSnapshot}
              profile={p}
              monthlyScores={fyScores}
              categoryStats={(categoryStats ?? []) as CategoryStat[]}
              tasks={fyTasks}
              awards={fyAwards}
              attendanceLeaves={(fyAttendanceLeaves ?? []) as Array<{ date: string; leave_type: string }>}
            />
          </div>
        </div>
      )}
    </div>
  )
}
