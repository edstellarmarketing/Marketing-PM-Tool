import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Plus, Megaphone } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface AnnouncementRow {
  id: string
  title: string
  departments: string[]
  due_date: string
  status: 'open' | 'active'
  bonus_points: number
  score_weight: number | null
  accepted_by: string | null
  accepted_at: string | null
  accepted_task_id: string | null
  created_at: string
  award_types: { name: string; icon: string; bonus_points: number } | null
}

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default async function AdminAnnouncementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const admin = createAdminClient()
  const { data } = await admin
    .from('announcements')
    .select('id, title, departments, due_date, status, bonus_points, score_weight, accepted_by, accepted_at, accepted_task_id, created_at, award_types(name, icon, bonus_points)')
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as unknown as AnnouncementRow[]

  // Look up accepted_by names for the rows that have one
  const acceptedIds = Array.from(new Set(rows.map(r => r.accepted_by).filter(Boolean))) as string[]
  let nameById: Record<string, string> = {}
  if (acceptedIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', acceptedIds)
    nameById = Object.fromEntries((profiles ?? []).map(p => [p.id, p.full_name]))
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Megaphone size={22} /> Announcements
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Tag a target department, set a reward, and let members accept.
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
                  <th className="px-4 py-2 font-medium">Departments</th>
                  <th className="px-4 py-2 font-medium">Due</th>
                  <th className="px-4 py-2 font-medium">Award</th>
                  <th className="px-4 py-2 font-medium">Points</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Accepted by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const taskPts = r.score_weight ?? 0
                  const total = taskPts + r.bonus_points
                  const href = r.status === 'active' && r.accepted_task_id
                    ? `/tasks/${r.accepted_task_id}`
                    : `/admin/announcements/${r.id}`
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="px-4 py-2.5">
                        <Link href={`/admin/announcements/${r.id}`} className="font-medium text-gray-900 dark:text-white hover:text-blue-600">
                          {r.title}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {r.departments.map(d => (
                            <span key={d} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                              {d}
                            </span>
                          ))}
                        </div>
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
                        {r.status === 'active' ? (
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
                        {r.accepted_by ? (
                          <Link href={href} className="hover:text-blue-600">
                            {nameById[r.accepted_by] ?? r.accepted_by.slice(0, 8)} →
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
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
