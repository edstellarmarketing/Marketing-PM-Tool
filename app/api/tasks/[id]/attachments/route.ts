import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  TASK_BUCKET,
  signMany,
  signOne,
  uploadAttachmentObject,
} from '@/lib/attachments'

export const dynamic = 'force-dynamic'

const PER_TASK_LIMIT = 10

/** Allowed viewers: admin, task owner, assigner. */
async function canViewTask(userId: string, taskId: string) {
  const admin = createAdminClient()
  const [{ data: profile }, { data: task }] = await Promise.all([
    admin.from('profiles').select('role').eq('id', userId).single(),
    admin.from('tasks').select('user_id, assigned_by, approval_status').eq('id', taskId).single(),
  ])
  if (!task) return { ok: false, reason: 'not_found' as const }
  const isAdmin = profile?.role === 'admin'
  const isOwner = task.user_id === userId
  const isAssigner = task.assigned_by === userId
  if (!isAdmin && !isOwner && !isAssigner) return { ok: false, reason: 'forbidden' as const }
  return { ok: true, isAdmin, isOwner, isAssigner, task }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, error } = await getAuthUser()
  if (error) return error

  const access = await canViewTask(user!.id, id)
  if (!access.ok) {
    const status = access.reason === 'not_found' ? 404 : 403
    return NextResponse.json({ error: access.reason }, { status })
  }

  const admin = createAdminClient()
  const { data: rows, error: dbErr } = await admin
    .from('task_attachments')
    .select('id, task_id, storage_path, file_name, mime_type, size_bytes, uploaded_by, created_at')
    .eq('task_id', id)
    .order('created_at', { ascending: true })

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  const signed = await signMany(TASK_BUCKET, (rows ?? []).map(r => r.storage_path))
  return NextResponse.json(
    (rows ?? []).map(r => ({ ...r, viewUrl: signed[r.storage_path] ?? null })),
  )
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, error } = await getAuthUser()
  if (error) return error

  const access = await canViewTask(user!.id, id)
  if (!access.ok) {
    const status = access.reason === 'not_found' ? 404 : 403
    return NextResponse.json({ error: access.reason }, { status })
  }
  // Only owner or admin can upload — the assigner cannot.
  if (!access.isAdmin && !access.isOwner) {
    return NextResponse.json({ error: 'Only the task owner or an admin can upload proof.' }, { status: 403 })
  }
  // Block uploads once the task has been approved.
  if (access.task.approval_status === 'approved') {
    return NextResponse.json({ error: 'Task is already approved; attachments are locked.' }, { status: 409 })
  }

  const formData = await req.formData().catch(() => null)
  const file = formData?.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded. Send multipart/form-data with field "file".' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Enforce per-task cap.
  const { count } = await admin
    .from('task_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', id)
  if ((count ?? 0) >= PER_TASK_LIMIT) {
    return NextResponse.json({ error: 'limit_reached', limit: PER_TASK_LIMIT }, { status: 422 })
  }

  const uploaded = await uploadAttachmentObject(TASK_BUCKET, id, file)
  if (uploaded.error) return NextResponse.json({ error: uploaded.error.message }, { status: uploaded.error.status })

  const row = uploaded.data!
  const { data: inserted, error: insertErr } = await admin
    .from('task_attachments')
    .insert({
      task_id: id,
      storage_path: row.storage_path,
      file_name: row.file_name,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      uploaded_by: user!.id,
    })
    .select()
    .single()

  if (insertErr || !inserted) {
    await admin.storage.from(TASK_BUCKET).remove([row.storage_path])
    return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  const viewUrl = await signOne(TASK_BUCKET, inserted.storage_path)
  return NextResponse.json({ ...inserted, viewUrl }, { status: 201 })
}
