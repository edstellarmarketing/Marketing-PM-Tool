import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrTeamLead } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'
import { ANNOUNCEMENT_BUCKET, deleteAttachmentObject } from '@/lib/attachments'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { id, attachmentId } = await params
  const { profile, error } = await requireAdminOrTeamLead()
  if (error) return error

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('announcement_attachments')
    .select('id, announcement_id, storage_path, uploaded_by, announcements(status, created_by)')
    .eq('id', attachmentId)
    .single()

  if (!row || row.announcement_id !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const parent = (row as unknown as { announcements: { status: string; created_by: string } | null }).announcements
  // Team leads may only touch attachments on announcements they created.
  if (profile!.role !== 'admin' && parent?.created_by !== profile!.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parentStatus = parent?.status
  const isOwn = row.uploaded_by === profile!.id
  const isOpenParent = parentStatus === 'open'

  // RLS allows: any admin if open, OR uploader if active. App-layer mirror:
  if (!isOpenParent && !isOwn) {
    return NextResponse.json({ error: 'Cannot delete attachments on an active announcement uploaded by another admin.' }, { status: 403 })
  }

  const { error: delErr } = await admin.from('announcement_attachments').delete().eq('id', attachmentId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  await deleteAttachmentObject(ANNOUNCEMENT_BUCKET, row.storage_path)
  return NextResponse.json({ success: true })
}
