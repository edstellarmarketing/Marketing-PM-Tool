import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, requireAdminOrTeamLead, canManageProject } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const BUCKET = 'project-documents'

/**
 * GET /api/projects/:id/documents/:docId — stream the file back inline.
 *
 * The "Project Document" button links here with target="_blank". We proxy the
 * bytes ourselves (rather than redirecting to a Supabase signed URL) so we fully
 * control the response headers: HTML is served as text/html so the browser
 * RENDERS it as a page instead of showing the source, while Word files download.
 *
 * Uploaded HTML is untrusted, so it's sandboxed via CSP — markup and inline CSS
 * render, but scripts and same-origin access are blocked (no session/cookie
 * theft from another user opening the doc).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params
  const { user, error } = await getAuthUser()
  if (error || !user) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('project_documents')
    .select('storage_path, file_name, mime_type')
    .eq('id', docId)
    .eq('project_id', id)
    .single()

  if (!doc) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(doc.storage_path)
  if (dlErr || !blob) return NextResponse.json({ error: 'Failed to load document' }, { status: 500 })

  const bytes = new Uint8Array(await blob.arrayBuffer())
  const isHtml = doc.mime_type === 'text/html'

  const headers = new Headers()
  headers.set('Content-Type', doc.mime_type)
  headers.set('Content-Length', String(bytes.byteLength))
  headers.set('X-Content-Type-Options', 'nosniff')
  if (isHtml) {
    // Render in-tab, but sandbox the untrusted document (no scripts, opaque origin).
    headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(doc.file_name)}"`)
    headers.set('Content-Security-Policy', 'sandbox allow-popups allow-top-navigation-by-user-activation')
  } else {
    // Word docs can't render in-browser — hand off as a download.
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.file_name)}"`)
  }

  return new NextResponse(bytes, { status: 200, headers })
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
