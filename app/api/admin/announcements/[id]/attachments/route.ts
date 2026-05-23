import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ANNOUNCEMENT_BUCKET,
  signOne,
  uploadAttachmentObject,
} from '@/lib/attachments'

export const dynamic = 'force-dynamic'

const PER_ANNOUNCEMENT_LIMIT = 5

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { profile, error } = await requireAdmin()
  if (error) return error

  const formData = await req.formData().catch(() => null)
  const file = formData?.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded. Send multipart/form-data with field "file".' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Parent must exist (CASCADE handles deletion; this just gives a nicer error).
  const { data: announcement } = await admin
    .from('announcements')
    .select('id, status')
    .eq('id', id)
    .single()
  if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  // Enforce per-announcement cap.
  const { count } = await admin
    .from('announcement_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('announcement_id', id)
  if ((count ?? 0) >= PER_ANNOUNCEMENT_LIMIT) {
    return NextResponse.json({ error: 'limit_reached', limit: PER_ANNOUNCEMENT_LIMIT }, { status: 422 })
  }

  const uploaded = await uploadAttachmentObject(ANNOUNCEMENT_BUCKET, id, file)
  if (uploaded.error) return NextResponse.json({ error: uploaded.error.message }, { status: uploaded.error.status })

  const row = uploaded.data!
  const { data: inserted, error: insertErr } = await admin
    .from('announcement_attachments')
    .insert({
      announcement_id: id,
      storage_path: row.storage_path,
      file_name: row.file_name,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      uploaded_by: profile!.id,
    })
    .select()
    .single()

  if (insertErr || !inserted) {
    // Compensating cleanup so we don't leave orphan storage objects.
    await admin.storage.from(ANNOUNCEMENT_BUCKET).remove([row.storage_path])
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  const viewUrl = await signOne(ANNOUNCEMENT_BUCKET, inserted.storage_path)
  return NextResponse.json({ ...inserted, viewUrl }, { status: 201 })
}
