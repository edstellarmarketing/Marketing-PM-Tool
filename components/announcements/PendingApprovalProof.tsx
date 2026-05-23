'use client'

import { useEffect, useState } from 'react'
import ScreenshotGallery, { type GalleryItem } from './ScreenshotGallery'

interface Props {
  taskId: string
}

/**
 * Inline read-only proof gallery used on /admin/pending-approvals so admins can
 * scan the member's submitted screenshots before approving/rejecting.
 * Lazy-fetches the attachment list on mount; renders nothing if there are
 * no attachments.
 */
export default function PendingApprovalProof({ taskId }: Props) {
  const [items, setItems] = useState<GalleryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/tasks/${taskId}/attachments`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`)))
      .then((rows: { id: string; file_name: string; viewUrl: string | null }[]) => {
        if (!cancelled) setItems(rows.map(r => ({ id: r.id, file_name: r.file_name, viewUrl: r.viewUrl })))
      })
      .catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [taskId])

  if (error) return null
  if (items === null) {
    return <p className="text-[10px] text-gray-400 mt-1">Loading proof…</p>
  }
  if (items.length === 0) {
    return <p className="text-[10px] text-gray-400 mt-1">No proof screenshots uploaded.</p>
  }

  return (
    <div className="mt-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500 mb-1">
        Proof of success ({items.length})
      </p>
      <ScreenshotGallery items={items} size="sm" />
    </div>
  )
}
