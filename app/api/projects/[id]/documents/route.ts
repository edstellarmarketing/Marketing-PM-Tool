import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, requireAdminOrTeamLead, canManageProject } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const BUCKET = 'project-documents'
const MAX_SIZE = 10_485_760 // 10 MB
const PER_PROJECT_LIMIT = 20
const SIGNED_URL_TTL_SEC = 300 // 5 minutes

// Map extension → the content type we store the object with. Storing HTML as
// text/html is what makes the signed URL render inline in a new tab; Word docs
// download. We key off the extension because browsers report Word MIME types
// inconsistently (some send application/octet-stream).
const EXT_MIME: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
  return cleaned.length > 0 ? cleaned : 'document'
}

/** GET /api/projects/:id/documents — list a project's documents with signed URLs. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, error } = await getAuthUser()
  if (error || !user) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: rows, error: dbErr } = await admin
    .from('project_documents')
    .select('id, project_id, storage_path, file_name, mime_type, size_bytes, uploaded_by, created_at')
    .eq('project_id', id)
    .order('created_at', { ascending: true })

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  const paths = (rows ?? []).map(r => r.storage_path)
  const signed = paths.length
    ? (await admin.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SEC)).data ?? []
    : []
  const urlByPath: Record<string, string | null> = {}
  for (const s of signed) urlByPath[s.path ?? ''] = s.signedUrl ?? null

  return NextResponse.json(
    (rows ?? []).map(r => ({ ...r, viewUrl: urlByPath[r.storage_path] ?? null })),
  )
}

/** POST /api/projects/:id/documents — upload one document (multipart, field "file"). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { profile, error } = await requireAdminOrTeamLead()
  if (error || !profile) return error ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Team leads may only manage projects they created (admins: any).
  if (!(await canManageProject(profile, id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await req.formData().catch(() => null)
  const file = formData?.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded. Send multipart/form-data with field "file".' }, { status: 400 })
  }

  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const mime = EXT_MIME[ext]
  if (!mime) {
    return NextResponse.json({ error: 'Unsupported file type. Allowed: HTML, DOC, DOCX.' }, { status: 415 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Empty file.' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `File too large. Max ${MAX_SIZE} bytes (10 MB).` }, { status: 413 })
  }

  const admin = createAdminClient()

  // Enforce a per-project cap.
  const { count } = await admin
    .from('project_documents')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', id)
  if ((count ?? 0) >= PER_PROJECT_LIMIT) {
    return NextResponse.json({ error: 'limit_reached', limit: PER_PROJECT_LIMIT }, { status: 422 })
  }

  const sanitized = sanitizeFilename(file.name)
  const path = `${id}/${randomUUID()}-${sanitized}`
  const bytes = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: false,
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: inserted, error: insErr } = await admin
    .from('project_documents')
    .insert({
      project_id: id,
      storage_path: path,
      file_name: sanitized,
      mime_type: mime,
      size_bytes: file.size,
      uploaded_by: profile.id,
    })
    .select()
    .single()

  if (insErr || !inserted) {
    await admin.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: insErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SEC)
  return NextResponse.json({ ...inserted, viewUrl: signed?.signedUrl ?? null }, { status: 201 })
}
