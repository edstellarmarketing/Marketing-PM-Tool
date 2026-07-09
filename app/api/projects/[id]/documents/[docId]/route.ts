import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, requireAdminOrTeamLead, canManageProject } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const BUCKET = 'project-documents'
const SIGNED_URL_TTL_SEC = 300 // 5 minutes

/**
 * GET /api/projects/:id/documents/:docId — redirect to a short-lived signed URL.
 * The "Project Document" button links here with target="_blank", so the browser
 * opens the file directly in a new tab (HTML renders inline; Word downloads).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params
  const { user, error } = await getAuthUser()
  if (error || !user) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('project_documents')
    .select('storage_path')
    .eq('id', docId)
    .eq('project_id', id)
    .single()

  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SEC)
  if (!signed?.signedUrl) return NextResponse.json({ error: 'Failed to sign document URL' }, { status: 500 })

  return NextResponse.redirect(signed.signedUrl)
}

/** DELETE /api/projects/:id/documents/:docId — remove a document (project managers only). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params
  const { profile, error } = await requireAdminOrTeamLead()
  if (error || !profile) return error ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!(await canManageProject(profile, id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('project_documents')
    .select('storage_path')
    .eq('id', docId)
    .eq('project_id', id)
    .single()

  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  await admin.storage.from(BUCKET).remove([doc.storage_path])
  const { error: delErr } = await admin.from('project_documents').delete().eq('id', docId).eq('project_id', id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
