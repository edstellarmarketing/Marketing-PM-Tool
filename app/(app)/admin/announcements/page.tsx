import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePageRole } from '@/lib/api'
import { Plus, Megaphone, Clock } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface AnnouncementRow {
  id: string
  title: string
  target_mode: 'department' | 'users'
  departments: string[]
  user_ids: string[]
  due_date: string
  status: 'open' | 'active'
  bonus_points: number
  score_weight: number | null
  created_at: string
  award_types: { name: string; icon: string; bonus_points: number } | null
}

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default async function AdminAnnouncementsPage() {
  const me = await requirePageRole(['admin', 'team_lead'])

  const admin = createAdminClient()
  let annQuery = admin
    .from('announcements')
    .select('id, title, target_mode, departments, user_ids, due_date, status, bonus_points, score_weight, created_at, award_types(name, icon, bonus_points)')
    .order('created_at', { ascending: false })
  // Team leads manage only the announcements they created.
  if (me.role === 'team_lead') annQuery = annQuery.eq('created_by', me.id)

  const [{ data: annData }, { data: acceptanceData }] = await Promise.all([
    annQuery,
    admin
      .from('announcement_acceptances')
      .select('announcement_id, status'),
  ])

  const rows = (annData ?? []) as unknown as AnnouncementRow[]

  // Roll up per-announcement counts: pending requests vs approved accepters
  const pendingByAnn: Record<string, number> = {}
  const approvedByAnn: Record<string, number> = {}
  for (const r of acceptanceData ?? []) {
    if (r.status === 'requested') pendingByAnn[r.announcement_id] = (pendingByAnn[r.announcement_id] ?? 0) + 1
    else if (r.status === 'approved') approvedByAnn[r.announcement_id] = (approvedByAnn[r.announcement_id] ?? 0) + 1
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Megaphone size={22} /> Announcements
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Tag a target department or specific users, set a reward, and let members accept.
          </p>
        </div>
        <Link
          href="/admin/announcements/new"
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm"
        >
          <Plus size={16} /> New Announcement
        </Link>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No announcements yet. Create one to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-left text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Title</th>
                  <th className="px-4 py-2 font-medium">Target</th>
                  <th className="px-4 py-2 font-medium">Due</th>
                  <th className="px-4 py-2 font-medium">Award</th>
                  <th className="px-4 py-2 font-medium">Points</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Accepters</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const taskPts = r.score_weight ?? 0
                  const total = taskPts + r.bonus_points
                  const pendingCount = pendingByAnn[r.id] ?? 0
                  const approvedCount = approvedByAnn[r.id] ?? 0
                  const hasPending = pendingCount > 0
                  // Orange row highlight whenever requests are awaiting shortlisting
                  const rowCls = hasPending
                    ? 'bg-orange-50/70 dark:bg-orange-950/30 hover:bg-orange-100/70 dark:hover:bg-orange-950/40'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  return (
                    <tr
                      key={r.id}
                      className={`border-t border-gray-100 dark:border-gray-800 transition-colors ${rowCls}`}
                    >
                      <td className="px-4 py-2.5">
                        <Link href={`/admin/announcements/${r.id}`} className="font-medium text-gray-900 dark:text-white hover:text-blue-600">
                          {r.title}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        {r.target_mode === 'users' ? (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            🎯 {r.user_ids.length} user{r.user_ids.length === 1 ? '' : 's'}
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.departments.map(d => (
                              <span key={d} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                                {d}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">{formatDate(r.due_date)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {r.award_types ? (
                          <span>
                            <span aria-hidden>{r.award_types.icon}</span> {r.award_types.name}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300 font-mono">
                        {taskPts > 0 ? `${taskPts} + ${r.bonus_points} = ${total}` : `auto + ${r.bonus_points}`}
                      </td>
                      <td className="px-4 py-2.5">
                        {hasPending ? (
                          <Link
                            href={`/admin/announcements/${r.id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-800 hover:bg-orange-200 dark:hover:bg-orange-900/60"
                            title="Shortlist accepters"
                          >
                            <Clock size={11} />
                            Approval pending ({pendingCount})
                          </Link>
                        ) : approvedCount > 0 ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
                            Active
                          </span>
                        ) : (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
                            Open
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {pendingCount === 0 && approvedCount === 0 ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <Link href={`/admin/announcements/${r.id}`} className="text-xs hover:text-blue-600">
                            {approvedCount > 0 && <span className="font-semibold text-emerald-700 dark:text-emerald-300">{approvedCount} approved</span>}
                            {approvedCount > 0 && pendingCount > 0 && <span className="text-gray-400 mx-1">·</span>}
                            {pendingCount > 0 && <span className="font-semibold text-orange-700 dark:text-orange-300">{pendingCount} pending</span>}
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
