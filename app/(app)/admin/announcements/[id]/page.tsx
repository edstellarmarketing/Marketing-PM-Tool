import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft, Pencil } from 'lucide-react'
import RewardStrip from '@/components/announcements/RewardStrip'
import ScreenshotGallery from '@/components/announcements/ScreenshotGallery'
import { signMany } from '@/lib/attachments'
import AnnouncementDeleteButton from '@/components/admin/AnnouncementDeleteButton'
import AcceptanceRequestsPanel, { type AcceptanceRow } from '@/components/admin/AcceptanceRequestsPanel'

export const dynamic = 'force-dynamic'

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function AnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

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

  // Profile lookups for accepters + creator
  const accIds = (acceptancesRes.data ?? []).map(r => r.user_id)
  const profileIds = Array.from(new Set([a.created_by, ...accIds].filter(Boolean))) as string[]
  const { data: profileRows } = await admin
    .from('profiles')
    .select('id, full_name, avatar_url, department')
    .in('id', profileIds)
  const pById = Object.fromEntries((profileRows ?? []).map(p => [p.id, p]))

  const acceptances: AcceptanceRow[] = (acceptancesRes.data ?? []).map(r => ({
    id: r.id,
    user_id: r.user_id,
    status: r.status,
    task_id: r.task_id,
    requested_at: r.requested_at,
    approved_at: r.approved_at,
    user: pById[r.user_id]
      ? {
          full_name: pById[r.user_id].full_name,
          avatar_url: pById[r.user_id].avatar_url,
          department: pById[r.user_id].department,
        }
      : null,
  }))

  // Sign URLs for announcement attachments
  const annSigned = await signMany('announcement-attachments', (annAttRes.data ?? []).map(x => x.storage_path))

  // Proof attachments across all approved acceptance tasks
  const approvedTaskIds = acceptances
    .filter(r => r.status === 'approved' && r.task_id)
    .map(r => r.task_id!) as string[]
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

      {acceptances.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Acceptances</h2>
          <AcceptanceRequestsPanel
            announcementId={id}
            acceptances={acceptances}
            totalBonus={a.bonus_points ?? 0}
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
