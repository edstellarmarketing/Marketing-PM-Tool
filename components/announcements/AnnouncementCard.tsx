'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import RewardStrip from './RewardStrip'
import ScreenshotGallery from './ScreenshotGallery'
import AcceptAnnouncementButton from './AcceptAnnouncementButton'
import type { AnnouncementRow, AttachmentRow } from './types'

interface Props {
  announcement: AnnouncementRow
  variant: 'full' | 'compact'
  /** When true, render the slim reward strip and no Accept button. */
  showAcceptedState?: boolean
  onAccepted?: (result: { status: 'requested' | 'approved'; task_id: string | null }) => void
}

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AnnouncementCard({
  announcement, variant, showAcceptedState = false, onAccepted,
}: Props) {
  const [attachments, setAttachments] = useState<AttachmentRow[]>([])

  useEffect(() => {
    // Only fetch for the full variant — compact tiles on the dashboard widget
    // can omit reference thumbs for density.
    if (variant !== 'full') return
    fetch(`/api/announcements/${announcement.id}/attachments`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: AttachmentRow[]) => setAttachments(rows))
      .catch(() => setAttachments([]))
  }, [announcement.id, variant])

  const taskPoints = announcement.score_weight ?? 0
  const award = announcement.award_types ?? null

  if (variant === 'compact') {
    const totalPoints = taskPoints + (announcement.bonus_points ?? 0)
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-3 flex items-center gap-3 w-full">
        <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl flex-shrink-0 text-white shadow-sm bg-gradient-to-br from-amber-500 to-amber-700 dark:from-amber-400 dark:to-amber-600">
          <span className="text-xl font-extrabold leading-none">{totalPoints}</span>
          <span className="text-[9px] tracking-widest mt-0.5">PTS</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200 truncate">
            <span aria-hidden>{award?.icon ?? '🏅'} </span>
            {award?.name ?? 'Bonus reward'}
          </p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{announcement.title}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Due {formatDate(announcement.due_date)}</p>
        </div>
        {showAcceptedState ? null : (
          <AcceptAnnouncementButton announcement={announcement} size="compact" onAccepted={onAccepted} />
        )}
      </div>
    )
  }

  // Full variant — used on /announcements
  return (
    <article className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
      <RewardStrip
        awardIcon={award?.icon ?? null}
        awardName={award?.name ?? null}
        taskPoints={taskPoints}
        bonusPoints={announcement.bonus_points}
        variant={showAcceptedState ? 'slim' : 'hero'}
        showAnimation={!showAcceptedState}
      />

      <div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-white break-words">{announcement.title}</h3>
        {announcement.description && (
          // Full text always — no line-clamp, no truncate. break-words handles long unbroken strings.
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-line break-words">{announcement.description}</p>
        )}
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Due <strong className="text-gray-700 dark:text-gray-200">{formatDate(announcement.due_date)}</strong></span>
          <span>Priority <strong className="capitalize text-gray-700 dark:text-gray-200">{announcement.priority}</strong></span>
          {announcement.task_type && (
            <span>Type <strong className="text-gray-700 dark:text-gray-200">{announcement.task_type.replace(/_/g, ' ')}</strong></span>
          )}
          {announcement.target_mode === 'users' ? (
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 font-semibold">
              🎯 Assigned to you
            </span>
          ) : announcement.departments.length > 0 ? (
            <span>Dept: <strong className="text-gray-700 dark:text-gray-200">{announcement.departments.join(', ')}</strong></span>
          ) : null}
        </div>
      </div>

      {attachments.length > 0 && (
        <ScreenshotGallery
          title="Reference from admin"
          items={attachments.map(a => ({ id: a.id, file_name: a.file_name, viewUrl: a.viewUrl }))}
          size="sm"
        />
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        {showAcceptedState ? (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Accepted {announcement.accepted_at ? new Date(announcement.accepted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
            </p>
            {announcement.accepted_task_id && (
              <Link
                href={`/tasks/${announcement.accepted_task_id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Open task →
              </Link>
            )}
          </>
        ) : (
          <>
            <span />
            <AcceptAnnouncementButton announcement={announcement} onAccepted={onAccepted} />
          </>
        )}
      </div>
    </article>
  )
}
