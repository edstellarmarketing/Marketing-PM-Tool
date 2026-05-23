import { randomUUID } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
export const MAX_SIZE = 5_242_880 // 5 MB
export const SIGNED_URL_TTL_SEC = 300 // 5 minutes

export const ANNOUNCEMENT_BUCKET = 'announcement-attachments'
export const TASK_BUCKET = 'task-attachments'

export type AttachmentBucket = typeof ANNOUNCEMENT_BUCKET | typeof TASK_BUCKET

export interface UploadResult {
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
}

export interface UploadError {
  status: number
  message: string
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  return cleaned.length > 0 ? cleaned : 'file'
}

export function validateAttachment(file: File): UploadError | null {
  if (!ALLOWED_MIME.includes(file.type as typeof ALLOWED_MIME[number])) {
    return { status: 415, message: 'Unsupported file type. Allowed: PNG, JPEG, WEBP, GIF.' }
  }
  if (file.size > MAX_SIZE) {
    return { status: 413, message: `File too large. Max ${MAX_SIZE} bytes (5 MB).` }
  }
  if (file.size === 0) {
    return { status: 400, message: 'Empty file.' }
  }
  return null
}

export async function uploadAttachmentObject(
  bucket: AttachmentBucket,
  parentId: string,
  file: File,
): Promise<{ data?: UploadResult; error?: UploadError }> {
  const valErr = validateAttachment(file)
  if (valErr) return { error: valErr }

  const sanitized = sanitizeFilename(file.name)
  const path = `${parentId}/${randomUUID()}-${sanitized}`
  const bytes = Buffer.from(await file.arrayBuffer())

  const admin = createAdminClient()
  const { error } = await admin.storage.from(bucket).upload(path, bytes, {
    contentType: file.type,
    upsert: false,
  })
  if (error) return { error: { status: 500, message: error.message } }

  return {
    data: {
      storage_path: path,
      file_name: sanitized,
      mime_type: file.type,
      size_bytes: file.size,
    },
  }
}

export async function deleteAttachmentObject(bucket: AttachmentBucket, storagePath: string): Promise<void> {
  const admin = createAdminClient()
  await admin.storage.from(bucket).remove([storagePath])
}

export async function signOne(bucket: AttachmentBucket, storagePath: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.storage.from(bucket).createSignedUrl(storagePath, SIGNED_URL_TTL_SEC)
  return data?.signedUrl ?? null
}

/** Sign many paths in a single round-trip. Returns a map of path → signedUrl (or null on failure). */
export async function signMany(
  bucket: AttachmentBucket,
  storagePaths: string[],
): Promise<Record<string, string | null>> {
  if (storagePaths.length === 0) return {}
  const admin = createAdminClient()
  const { data } = await admin.storage.from(bucket).createSignedUrls(storagePaths, SIGNED_URL_TTL_SEC)
  const out: Record<string, string | null> = {}
  for (const entry of data ?? []) {
    out[entry.path ?? ''] = entry.signedUrl ?? null
  }
  // Ensure every input path has a key, even on per-path failure
  for (const p of storagePaths) if (!(p in out)) out[p] = null
  return out
}
