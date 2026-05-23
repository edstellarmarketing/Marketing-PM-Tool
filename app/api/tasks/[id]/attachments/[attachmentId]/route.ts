import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'
import { TASK_BUCKET, deleteAttachmentObject } from '@/lib/attachments'

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { id, attachmentId } = await params
  const { user, error } = await getAuthUser()
  if (error) return error

  const admin = createAdminClient()

  const [{ data: profile }, { data: row }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', user!.id).single(),
    admin
      .from('task_attachments')
      .select('id, task_id, storage_path, uploaded_by, tasks(approval_status)')
      .eq('id', attachmentId)
      .single(),
  ])

  if (!row || row.task_id !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const taskApproval = (row as unknown as { tasks: { approval_status: string } | null }).tasks?.approval_status
  const isAdmin = profile?.role === 'admin'
  const isUploader = row.uploaded_by === user!.id

  if (!isAdmin) {
    if (!isUploader) return NextResponse.json({ error: 'Only the uploader or an admin can delete.' }, { status: 403 })
    if (taskApproval === 'approved') {
      return NextResponse.json({ error: 'Task is approved; attachments are locked.' }, { status: 409 })
    }
  }

  const { error: delErr } = await admin.from('task_attachments').delete().eq('id', attachmentId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  await deleteAttachmentObject(TASK_BUCKET, row.storage_path)
  return NextResponse.json({ success: true })
}
