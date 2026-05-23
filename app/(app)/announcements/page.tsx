import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import MemberAnnouncementsList from '@/components/announcements/MemberAnnouncementsList'
import type { AnnouncementRow } from '@/components/announcements/types'

export const dynamic = 'force-dynamic'

export default async function MemberAnnouncementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('department, role')
    .eq('id', user.id)
    .single()

  const dept = profile?.department?.trim() ?? null

  // Acceptances by this user (across all announcements they've touched)
  const { data: myAcceptances } = await admin
    .from('announcement_acceptances')
    .select('announcement_id, status, task_id')
    .eq('user_id', user.id)

  const myAcceptanceMap = new Map<string, { status: 'requested' | 'approved'; task_id: string | null }>()
  for (const r of myAcceptances ?? []) {
    myAcceptanceMap.set(r.announcement_id, { status: r.status, task_id: r.task_id })
  }

  const selectCols = '*, award_types(name, icon, bonus_points)'

  // Open announcements visible to this user: dept match OR explicit user-target
  const visibilityFilters: string[] = []
  if (dept) visibilityFilters.push(`and(target_mode.eq.department,departments.cs.{${dept}})`)
  visibilityFilters.push(`and(target_mode.eq.users,user_ids.cs.{${user.id}})`)

  let openRows: AnnouncementRow[] = []
  const { data: openData } = await admin
    .from('announcements')
    .select(selectCols)
    .eq('status', 'open')
    .or(visibilityFilters.join(','))
    .order('created_at', { ascending: false })
  openRows = (openData ?? []) as unknown as AnnouncementRow[]

  // Announcements where the user has an acceptance row (any status)
  const interactedIds = Array.from(myAcceptanceMap.keys())
  let interactedRows: AnnouncementRow[] = []
  if (interactedIds.length > 0) {
    const { data } = await admin
      .from('announcements')
      .select(selectCols)
      .in('id', interactedIds)
      .order('created_at', { ascending: false })
    interactedRows = (data ?? []) as unknown as AnnouncementRow[]
  }

  // Bucket: Open (no acceptance from this user), Requested (status=requested),
  // Approved (status=approved).
  const requested: AnnouncementRow[] = []
  const approved: AnnouncementRow[] = []
  for (const r of interactedRows) {
    const acc = myAcceptanceMap.get(r.id)
    if (acc?.status === 'requested') requested.push(r)
    else if (acc?.status === 'approved') approved.push(r)
  }

  // Filter Open list to remove announcements the user has already acted on
  const visibleOpen = openRows.filter(r => !myAcceptanceMap.has(r.id))

  // Build a task_id map for the Approved bucket so the card can link to the task
  const taskIdByAnnouncement: Record<string, string | null> = {}
  for (const [annId, acc] of myAcceptanceMap.entries()) {
    if (acc.status === 'approved') taskIdByAnnouncement[annId] = acc.task_id
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Megaphone size={22} /> Announcements
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {dept
            ? <>Open for <span className="font-semibold text-gray-700 dark:text-gray-200">{dept}</span> and announcements tagged to you directly.</>
            : 'Showing only announcements tagged to you directly (you don\'t have a department set).'}
        </p>
      </div>

      <MemberAnnouncementsList
        open={visibleOpen}
        requested={requested}
        approved={approved}
        taskIdByAnnouncement={taskIdByAnnouncement}
      />
    </div>
  )
}
