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

  let openRows: AnnouncementRow[] = []
  let acceptedRows: AnnouncementRow[] = []

  const selectCols = '*, award_types(name, icon, bonus_points)'

  if (dept) {
    const { data: open } = await admin
      .from('announcements')
      .select(selectCols)
      .eq('status', 'open')
      .contains('departments', [dept])
      .order('created_at', { ascending: false })
    openRows = (open ?? []) as unknown as AnnouncementRow[]
  }

  const { data: accepted } = await admin
    .from('announcements')
    .select(selectCols)
    .eq('accepted_by', user.id)
    .order('accepted_at', { ascending: false })
  acceptedRows = (accepted ?? []) as unknown as AnnouncementRow[]

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Megaphone size={22} /> Announcements
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {dept
            ? <>Open for <span className="font-semibold text-gray-700 dark:text-gray-200">{dept}</span></>
            : 'You don\'t have a department set — ask an admin to assign one.'}
        </p>
      </div>

      <MemberAnnouncementsList open={openRows} accepted={acceptedRows} />
    </div>
  )
}
