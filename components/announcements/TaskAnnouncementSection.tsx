import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { signMany, ANNOUNCEMENT_BUCKET } from '@/lib/attachments'
import RewardStrip from './RewardStrip'
import ScreenshotGallery from './ScreenshotGallery'
import TaskProofUploader from './TaskProofUploader'

interface Props {
  taskId: string
  announcementId: string
  /** Whether this caller can upload proof (task owner or admin). */
  canUpload: boolean
  /** Already-approved tasks lock proof. */
  isApproved: boolean
}

/**
 * Server-rendered section embedded on the task detail page when
 * tasks.source_announcement_id is set. Shows the reward, the admin's
 * reference screenshots, and the proof-of-success uploader for the assignee.
 */
export default async function TaskAnnouncementSection({
  taskId, announcementId, canUpload, isApproved,
}: Props) {
  const admin = createAdminClient()
  const [annRes, attRes, proofRes] = await Promise.all([
    admin
      .from('announcements')
      .select('id, title, departments, due_date, bonus_points, score_weight, created_by, award_types(name, icon)')
      .eq('id', announcementId)
      .single(),
    admin
      .from('announcement_attachments')
      .select('id, file_name, storage_path')
      .eq('announcement_id', announcementId)
      .order('created_at'),
    admin
      .from('task_attachments')
      .select('id, file_name, storage_path, uploaded_by, created_at')
      .eq('task_id', taskId)
      .order('created_at'),
  ])

  if (!annRes.data) return null
  const ann = annRes.data
  const award = (ann as unknown as { award_types: { name: string; icon: string } | null }).award_types

  const refPaths = (attRes.data ?? []).map(x => x.storage_path)
  const refSigned = await signMany(ANNOUNCEMENT_BUCKET, refPaths)
  const refItems = (attRes.data ?? []).map(x => ({
    id: x.id,
    file_name: x.file_name,
    viewUrl: refSigned[x.storage_path] ?? null,
  }))

  const proofPaths = (proofRes.data ?? []).map(x => x.storage_path)
  const proofSigned = await signMany('task-attachments', proofPaths)
  const initialProof = (proofRes.data ?? []).map(x => ({
    id: x.id,
    file_name: x.file_name,
    viewUrl: proofSigned[x.storage_path] ?? null,
    uploaded_by: x.uploaded_by,
    created_at: x.created_at,
  }))

  return (
    <div className="space-y-4">
      <section className="bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200 uppercase tracking-wide">
            Linked announcement
          </h2>
          <Link
            href={`/admin/announcements/${ann.id}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline"
          >
            See announcement <ExternalLink size={11} />
          </Link>
        </div>

        <RewardStrip
          awardIcon={award?.icon ?? null}
          awardName={award?.name ?? null}
          taskPoints={ann.score_weight ?? 0}
          bonusPoints={ann.bonus_points}
          variant="slim"
          showAnimation={false}
        />

        <div className="text-xs text-gray-700 dark:text-gray-300">
          <p className="font-medium text-gray-900 dark:text-white">{ann.title}</p>
          <p className="text-gray-500 dark:text-gray-400 mt-0.5">
            {ann.departments.join(', ')} · Due {new Date(ann.due_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>

        {refItems.length > 0 && (
          <ScreenshotGallery
            title="Reference from admin"
            items={refItems}
            size="sm"
          />
        )}
      </section>

      <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          Proof of success
        </h2>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 -mt-1.5">
          Upload screenshots showing your delivered work. Locked once the task is approved.
        </p>
        <TaskProofUploader
          taskId={taskId}
          initial={initialProof}
          canUpload={canUpload && !isApproved}
          readOnly={isApproved}
        />
      </section>
    </div>
  )
}
