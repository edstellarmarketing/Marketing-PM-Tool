import Link from 'next/link'
import { Megaphone, ArrowRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import AnnouncementCard from './AnnouncementCard'
import type { AnnouncementRow } from './types'

interface Props {
  userId: string
}

/**
 * Server component. Renders the top-of-dashboard widget showing up to 3 open
 * announcements scoped to the member's department. Returns null if the member
 * has no department or no open announcements (no empty card on the dashboard).
 */
export default async function DashboardAnnouncementsWidget({ userId }: Props) {
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('department')
    .eq('id', userId)
    .single()

  const dept = profile?.department?.trim()
  if (!dept) return null

  const { data } = await admin
    .from('announcements')
    .select('*, award_types(name, icon, bonus_points)')
    .eq('status', 'open')
    .contains('departments', [dept])
    .order('created_at', { ascending: false })
    .limit(3)

  const rows = (data ?? []) as unknown as AnnouncementRow[]
  if (rows.length === 0) return null

  return (
    <section className="bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-900/40 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
          <Megaphone size={16} className="text-amber-600 dark:text-amber-400" />
          Announcements for {dept}
        </h2>
        <Link
          href="/announcements"
          className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline"
        >
          See all <ArrowRight size={12} />
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {rows.map(a => (
          <AnnouncementCard key={a.id} announcement={a} variant="compact" />
        ))}
      </div>
    </section>
  )
}
