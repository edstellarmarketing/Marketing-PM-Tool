'use client'

import ScreenshotUploader, { type AttachmentRecord } from './ScreenshotUploader'

interface Props {
  taskId: string
  initial: AttachmentRecord[]
  canUpload: boolean
  readOnly: boolean
}

const PER_TASK_LIMIT = 10

/**
 * Thin client wrapper around ScreenshotUploader for task proof attachments.
 * Centralizes the endpoint construction so callers only pass taskId.
 */
export default function TaskProofUploader({ taskId, initial, canUpload, readOnly }: Props) {
  if (!canUpload && initial.length === 0) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">No proof uploaded yet.</p>
    )
  }
  return (
    <ScreenshotUploader
      uploadUrl={`/api/tasks/${taskId}/attachments`}
      deleteUrlFor={(attId) => `/api/tasks/${taskId}/attachments/${attId}`}
      initial={initial}
      maxFiles={PER_TASK_LIMIT}
      readOnly={readOnly || !canUpload}
      hint={`PNG / JPG / WEBP / GIF · max 5 MB each · up to ${PER_TASK_LIMIT} files`}
    />
  )
}
