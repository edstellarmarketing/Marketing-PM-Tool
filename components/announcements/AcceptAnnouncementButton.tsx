'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import AcceptConfirmationModal from './AcceptConfirmationModal'
import type { AnnouncementRow, AttachmentRow } from './types'

interface Props {
  announcement: AnnouncementRow
  /** Size variant. `compact` is used on the dashboard widget. */
  size?: 'default' | 'compact'
  /** Called after the server responds (approved → task created, requested → awaiting admin). */
  onAccepted?: (result: { status: 'requested' | 'approved'; task_id: string | null }) => void
  /** Pass attachments already fetched at page-load (saves a round-trip). */
  preloadedAttachments?: AttachmentRow[]
}

export default function AcceptAnnouncementButton({
  announcement, size = 'default', onAccepted, preloadedAttachments,
}: Props) {
  const [open, setOpen] = useState(false)
  const [attachments, setAttachments] = useState<AttachmentRow[]>(preloadedAttachments ?? [])
  const [loadingAtt, setLoadingAtt] = useState(false)

  useEffect(() => {
    if (!open || preloadedAttachments) return
    setLoadingAtt(true)
    fetch(`/api/announcements/${announcement.id}/attachments`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((rows: AttachmentRow[]) => setAttachments(rows))
      .catch(() => setAttachments([]))
      .finally(() => setLoadingAtt(false))
  }, [open, announcement.id, preloadedAttachments])

  const isCompact = size === 'compact'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[
          'inline-flex items-center gap-1.5 font-medium rounded-lg shadow-sm transition-colors',
          'bg-amber-600 hover:bg-amber-700 text-white',
          isCompact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        ].join(' ')}
      >
        <Sparkles size={isCompact ? 12 : 14} />
        {isCompact ? 'Accept' : 'Accept & Add to Tasks'}
      </button>

      {open && (
        <AcceptConfirmationModal
          announcement={announcement}
          attachments={loadingAtt ? [] : attachments}
          onClose={() => setOpen(false)}
          onAccepted={onAccepted}
        />
      )}
    </>
  )
}
