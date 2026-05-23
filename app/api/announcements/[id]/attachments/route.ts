import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'
import { ANNOUNCEMENT_BUCKET, signMany } from '@/lib/attachments'

export const dynamic = 'force-dynamic'

/**
 * List attachments for an announcement with fresh signed URLs.
 * Visible to admins (any announcement) or to members whose department is in
 * the announcement's `departments` array.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, error } = await getAuthUser()
  if (error) return error

  const admin = createAdminClient()

  const [{ data: profile }, { data: announcement }] = await Promise.all([
    admin.from('profiles').select('role, department').eq('id', user!.id).single(),
    admin.from('announcements').select('id, departments').eq('id', id).single(),
  ])

  if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

  const isAdmin = profile?.role === 'admin'
  const dept = profile?.department?.trim() ?? null
  const inDept = dept ? announcement.departments.includes(dept) : false

  if (!isAdmin && !inDept) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: rows, error: dbErr } = await admin
    .from('announcement_attachments')
    .select('id, announcement_id, storage_path, file_name, mime_type, size_bytes, uploaded_by, created_at')
    .eq('announcement_id', id)
    .order('created_at', { ascending: true })

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  const paths = (rows ?? []).map(r => r.storage_path)
  const signed = await signMany(ANNOUNCEMENT_BUCKET, paths)

  return NextResponse.json(
    (rows ?? []).map(r => ({ ...r, viewUrl: signed[r.storage_path] ?? null })),
  )
}
