import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePageRole } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'
import RewardStrip from '@/components/announcements/RewardStrip'
import ScreenshotGallery from '@/components/announcements/ScreenshotGallery'
import { signMany } from '@/lib/attachments'
import AnnouncementDeleteButton from '@/components/admin/AnnouncementDeleteButton'
import TaggedUsersPanel, { type TaggedUserRow } from '@/components/admin/TaggedUsersPanel'

export const dynamic = 'force-dynamic'

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function AnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await requirePageRole(['admin', 'team_lead'])

  const admin = createAdminClient()
  const [annRes, annAttRes, acceptancesRes] = await Promise.all([
    admin.from('announcements').select('*, award_types(name, icon, bonus_points)').eq('id', id).single(),
    admin.from('announcement_attachments').select('id, file_name, storage_path').eq('announcement_id', id).order('created_at'),
    admin
      .from('announcement_acceptances')
      .select('id, user_id, status, task_id, requested_at, approved_at')
      .eq('announcement_id', id)
      .order('requested_at', { ascending: true }),
  ])
  if (!annRes.data) notFound()
  const a = annRes.data
  // Team leads may only view announcements they created.
  if (me.role === 'team_lead' && a.created_by !== me.id) redirect('/dashboard')

  // Build the "member roster" relevant to this announcement:
  //   • target_mode='users'      → just the tagged users
  //   • target_mode='department' → all active non-admin members in target depts
  const accIds = (acceptancesRes.data ?? []).map(r => r.user_id)
  let rosterIds: string[] = []
  if (a.target_mode === 'users') {
    rosterIds = (a.user_ids ?? []) as string[]
  } else {
    const { data: deptMembers } = await admin
      .from('profiles')
      .select('id')
      .eq('is_active', true)
      .neq('role', 'admin')
      .in('department', (a.departments ?? []) as string[])
    rosterIds = (deptMembers ?? []).map(m => m.id)
  }

  // Always also fetch creator + any extra accepters (in case someone outside the
  // current roster has an old acceptance row — e.g. dept-targeted then dept changed)
  const profileIds = Array.from(new Set([a.created_by, ...accIds, ...rosterIds].filter(Boolean))) as string[]
  const { data: profileRows } = profileIds.length > 0
    ? await admin
        .from('profiles')
        .select('id, full_name, avatar_url, department')
        .in('id', profileIds)
    : { data: [] as { id: string; full_name: string; avatar_url: string | null; department: string | null }[] }
  const pById = Object.fromEntries((profileRows ?? []).map(p => [p.id, p]))

  // Build the per-user status map keyed by user_id
  const acceptanceByUserId: Record<string, { id: string; status: 'requested' | 'approved'; task_id: string | null; requested_at: string; approved_at: string | null }> = {}
  for (const r of acceptancesRes.data ?? []) {
    acceptanceByUserId[r.user_id] = {
      id: r.id, status: r.status, task_id: r.task_id, requested_at: r.requested_at, approved_at: r.approved_at,
    }
  }

  // Compose roster rows (including any acceptances from users no longer in the
  // department roster, so the page never loses sight of a real accepter).
  const rosterIdSet = new Set(rosterIds)
  for (const uid of accIds) rosterIdSet.add(uid)
  const taggedUsers: TaggedUserRow[] = Array.from(rosterIdSet)
    .map(uid => pById[uid])
    .filter(Boolean)
    .map((p) => {
      const acc = acceptanceByUserId[p.id]
      return {
        id: p.id,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        department: p.department,
        status: acc?.status ?? 'not_yet',
        acceptance_id: acc?.id ?? null,
        task_id: acc?.task_id ?? null,
        requested_at: acc?.requested_at ?? null,
        approved_at: acc?.approved_at ?? null,
      }
    })
    // Stable ordering: name A→Z (the panel will re-group by status for dept mode)
    .sort((x, y) => x.full_name.localeCompare(y.full_name))

  // Sign URLs for announcement attachments
  const annSigned = await signMany('announcement-attachments', (annAttRes.data ?? []).map(x => x.storage_path))

  // Proof attachments across all approved acceptance tasks
  const approvedTaskIds = Object.values(acceptanceByUserId)
    .filter(a => a.status === 'approved' && a.task_id)
    .map(a => a.task_id!) as string[]
  let proofItems: { id: string; file_name: string; viewUrl: string | null }[] = []
  if (approvedTaskIds.length > 0) {
    const { data: proofRows } = await admin
      .from('task_attachments')
      .select('id, file_name, storage_path')
      .in('task_id', approvedTaskIds)
      .order('created_at')
    const taskSigned = await signMany('task-attachments', (proofRows ?? []).map(x => x.storage_path))
    proofItems = (proofRows ?? []).map(p => ({
      id: p.id,
      file_name: p.file_name,
      viewUrl: taskSigned[p.storage_path] ?? null,
    }))
  }

  const award = (a as unknown as { award_types: { name: string; icon: string } | null }).award_types
  const taskPoints = a.score_weight ?? 0

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link href="/admin/announcements" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600">
        <ArrowLeft size={14} /> Announcements
      </Link>

      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{a.title}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {a.departments.join(', ')} · Due {formatDate(a.due_date)} · Priority <span className="capitalize">{a.priority}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {a.status === 'active' ? (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
              Active
            </span>
          ) : (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
              Open
            </span>
          )}
          {a.status === 'open' && (
            <Link
              href={`/admin/announcements/${id}/edit`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Pencil size={12} /> Edit
            </Link>
          )}
        </div>
      </header>

      {a.description && (
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{a.description}</p>
      )}

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Reward</h2>
        <RewardStrip
          awardIcon={award?.icon ?? null}
          awardName={award?.name ?? null}
          taskPoints={taskPoints}
          bonusPoints={a.bonus_points}
          variant="hero"
          showAnimation={false}
        />
      </section>

      {(annAttRes.data ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Reference screenshots</h2>
          <ScreenshotGallery
            items={(annAttRes.data ?? []).map(x => ({
              id: x.id, file_name: x.file_name, viewUrl: annSigned[x.storage_path] ?? null,
            }))}
            size="md"
          />
        </section>
      )}

      {taggedUsers.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {a.target_mode === 'users' ? 'Tagged users' : 'Department members'}
          </h2>
          <TaggedUsersPanel
            announcementId={id}
            members={taggedUsers}
            totalBonus={a.bonus_points ?? 0}
            mode={a.target_mode === 'users' ? 'users' : 'department'}
            announcementUserIds={(a.user_ids ?? []) as string[]}
          />
        </section>
      )}

      {proofItems.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Proof of success (across all approved accepters)
          </h2>
          <ScreenshotGallery items={proofItems} size="md" />
        </section>
      )}

      <section className="pt-2">
        <AnnouncementDeleteButton id={id} title={a.title} />
      </section>
    </div>
  )
}
