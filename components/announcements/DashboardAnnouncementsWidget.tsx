import { createAdminClient } from '@/lib/supabase/admin'
import DashboardAnnouncementsCarousel from './DashboardAnnouncementsCarousel'
import type { AnnouncementRow } from './types'

interface Props {
  userId: string
}

/**
 * Server component. Fetches up to 3 latest open announcements visible to this
 * member (either by department OR by being explicitly tagged in user_ids).
 * Excludes any the user has already acted on (requested or approved) so the
 * dashboard always shows fresh asks. Renders a client-side carousel.
 *
 * Returns null when the member has nothing to act on.
 */
export default async function DashboardAnnouncementsWidget({ userId }: Props) {
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('department')
    .eq('id', userId)
    .single()

  const dept = profile?.department?.trim() ?? null

  // Visibility filter — match either targeting mode.
  const visibilityFilters: string[] = []
  if (dept) visibilityFilters.push(`and(target_mode.eq.department,departments.cs.{${dept}})`)
  visibilityFilters.push(`and(target_mode.eq.users,user_ids.cs.{${userId}})`)

  const { data: candidate } = await admin
    .from('announcements')
    .select('*, award_types(name, icon, bonus_points)')
    .eq('status', 'open')
    .or(visibilityFilters.join(','))
    .order('created_at', { ascending: false })
    .limit(10)   // fetch some extra so we can filter out already-acted ones and still keep 3

  // Drop announcements the member has already requested or been approved on
  const candidateIds = (candidate ?? []).map(c => c.id)
  let alreadyActedIds = new Set<string>()
  if (candidateIds.length > 0) {
    const { data: acted } = await admin
      .from('announcement_acceptances')
      .select('announcement_id')
      .eq('user_id', userId)
      .in('announcement_id', candidateIds)
    alreadyActedIds = new Set((acted ?? []).map(r => r.announcement_id))
  }

  const fresh = (candidate ?? [])
    .filter(c => !alreadyActedIds.has(c.id))
    .slice(0, 3) as unknown as AnnouncementRow[]

  if (fresh.length === 0) return null

  return <DashboardAnnouncementsCarousel announcements={fresh} dept={dept} />
}
