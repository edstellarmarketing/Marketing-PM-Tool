'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import ScreenshotGallery, { type GalleryItem } from './ScreenshotGallery'

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_SIZE = 5_242_880

export type AttachmentRecord = GalleryItem & {
  size_bytes?: number
  created_at?: string
  uploaded_by?: string
}

interface Props {
  /** Endpoint that accepts POST multipart/form-data with field "file". */
  uploadUrl: string
  /** Endpoint pattern with `:id` token replaced per attachment for DELETE. */
  deleteUrlFor: (attachmentId: string) => string
  /** Existing attachments to seed the strip with. */
  initial?: AttachmentRecord[]
  /** Cap enforced server-side; mirrored here for UX feedback. */
  maxFiles?: number
  /** Make the uploader read-only (still shows the gallery with no delete buttons). */
  readOnly?: boolean
  /** Optional callback whenever the list changes. */
  onChange?: (items: AttachmentRecord[]) => void
  /** Helper text under the dropzone. */
  hint?: string
}

export default function ScreenshotUploader({
  uploadUrl, deleteUrlFor, initial = [], maxFiles = 5, readOnly = false, onChange, hint,
}: Props) {
  const [items, setItems] = useState<AttachmentRecord[]>(initial)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { onChange?.(items) }, [items, onChange])

  const validateClient = useCallback((file: File): string | null => {
    if (!ALLOWED.includes(file.type)) return `"${file.name}" — unsupported file type.`
    if (file.size > MAX_SIZE) return `"${file.name}" is larger than 5 MB.`
    if (file.size === 0) return `"${file.name}" is empty.`
    return null
  }, [])

  const uploadOne = useCallback(async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(uploadUrl, { method: 'POST', credentials: 'include', body: fd })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(typeof data?.error === 'string' ? data.error : `Upload failed (${res.status}).`)
    }
    return data as AttachmentRecord
  }, [uploadUrl])

  const handleFiles = useCallback(async (filesList: FileList | File[]) => {
    if (readOnly) return
    setError(null)
    const files = Array.from(filesList)
    if (items.length + files.length > maxFiles) {
      setError(`At most ${maxFiles} screenshots. Remove some first.`)
      return
    }

    // Client-side validation
    for (const f of files) {
      const err = validateClient(f)
      if (err) { setError(err); return }
    }

    setUploading(n => n + files.length)
    for (const file of files) {
      try {
        const row = await uploadOne(file)
        setItems(prev => [...prev, row])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed.')
      } finally {
        setUploading(n => n - 1)
      }
    }
  }, [items.length, maxFiles, readOnly, uploadOne, validateClient])

  async function handleDelete(item: GalleryItem) {
    setError(null)
    try {
      const res = await fetch(deleteUrlFor(item.id), { method: 'DELETE', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(typeof data?.error === 'string' ? data.error : `Delete failed (${res.status}).`)
      }
      setItems(prev => prev.filter(i => i.id !== item.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.')
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files)
  }

  const atCap = items.length >= maxFiles

  return (
    <div className="space-y-2">
      {!readOnly && (
        <>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !atCap && inputRef.current?.click()}
            className={[
              'cursor-pointer rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors',
              atCap
                ? 'border-gray-200 dark:border-gray-800 opacity-60 cursor-not-allowed'
                : dragOver
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
                  : 'border-gray-300 dark:border-gray-700 hover:border-blue-400',
            ].join(' ')}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ALLOWED.join(',')}
              className="hidden"
              onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
              disabled={atCap}
            />
            <UploadCloud size={20} className="mx-auto text-gray-400 mb-1.5" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {atCap ? `Limit reached (${maxFiles}/${maxFiles})` : 'Drop screenshots here or click to upload'}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              {hint ?? `PNG / JPG / WEBP / GIF · max 5 MB each · up to ${maxFiles} files`}
            </p>
            {uploading > 0 && (
              <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">
                Uploading {uploading} file{uploading === 1 ? '' : 's'}…
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </>
      )}

      <ScreenshotGallery
        items={items}
        onDelete={readOnly ? undefined : handleDelete}
        size="sm"
      />
    </div>
  )
}
