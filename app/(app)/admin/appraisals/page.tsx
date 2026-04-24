import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentFinancialYear } from '@/lib/utils'
import type { Profile, AppraisalSnapshot } from '@/types'

function ratingBand(rate: number): { label: string; color: string } {
  if (rate >= 90) return { label: 'Exceptional', color: 'bg-green-100 text-green-700' }
  if (rate >= 75) return { label: 'Exceeds Expectations', color: 'bg-blue-100 text-blue-700' }
  if (rate >= 60) return { label: 'Meets Expectations', color: 'bg-yellow-100 text-yellow-700' }
  if (rate >= 45) return { label: 'Needs Improvement', color: 'bg-orange-100 text-orange-700' }
  return { label: 'Underperforming', color: 'bg-red-100 text-red-700' }
}

export default async function AppraisalsListPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  if (adminProfile?.role !== 'admin') redirect('/dashboard')

  const fy = getCurrentFinancialYear()

  const [{ data: profiles }, { data: snapshots }] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('appraisal_snapshots').select('*').eq('financial_year', fy),
  ])

  const allProfiles = (profiles ?? []) as Profile[]
  const allSnapshots = (snapshots ?? []) as AppraisalSnapshot[]

  function initials(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Appraisals</h1>
        <p className="text-sm text-gray-500 mt-0.5">Financial Year {fy} (April–March)</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left py-3 px-5">Member</th>
              <th className="text-left py-3 px-4">Total Score</th>
              <th className="text-left py-3 px-4">Avg Monthly</th>
              <th className="text-left py-3 px-4">Rating</th>
              <th className="text-left py-3 px-4">AI Summary</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {allProfiles.map(profile => {
              const snap = allSnapshots.find(s => s.user_id === profile.id)
              const rate = snap ? (snap.total_score > 0 ? Math.min(100, (snap.total_score / Math.max(1, snap.total_score)) * 100) : 0) : 0
              const band = snap ? ratingBand(Number(snap.avg_monthly_score)) : null
              return (
                <tr key={profile.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-5">
                    <div className="flex items-center gap-3">
                      {profile.avatar_url ? (
                        <img src={profile.avatar_url} alt={profile.full_name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {initials(profile.full_name)}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-gray-900">{profile.full_name}</p>
                        {profile.designation && <p className="text-xs text-gray-600">{profile.designation}</p>}
                        <p className="text-xs text-gray-400">{profile.department ?? '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-700">{snap?.total_score ?? '—'}</td>
                  <td className="py-3 px-4 text-sm text-gray-700">{snap ? Number(snap.avg_monthly_score).toFixed(1) : '—'}</td>
                  <td className="py-3 px-4">
                    {band ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${band.color}`}>{band.label}</span>
                    ) : (
                      <span className="text-xs text-gray-400">Not generated</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500 max-w-xs truncate">
                    {snap?.ai_summary ? snap.ai_summary.slice(0, 60) + '…' : '—'}
                  </td>
                  <td className="py-3 px-4">
                    <Link href={`/admin/appraisals/${profile.id}`} className="text-sm text-blue-600 hover:underline whitespace-nowrap">
                      {snap ? 'View' : 'Generate'} →
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
