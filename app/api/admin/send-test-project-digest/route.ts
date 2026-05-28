import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/api'
import {
  sendEmail,
  adminProjectDigestEmailHtml,
  type ProjectDigestTask,
} from '@/lib/email'
import { buildAdminProjectDigest } from '@/lib/project-digest'

const bodySchema = z.object({
  project_id: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const { profile, error } = await requireAdmin()
  if (error || !profile) return error ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'project_id is required' }, { status: 400 })

  const admin = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  const { data: { user: authUser }, error: userErr } = await admin.auth.admin.getUserById(profile.id)
  if (userErr || !authUser?.email) {
    return NextResponse.json({ error: 'Could not resolve your email address' }, { status: 500 })
  }
  const to = authUser.email

  if (!process.env.GOOGLE_APPS_SCRIPT_EMAIL_URL) {
    return NextResponse.json({
      error: 'GOOGLE_APPS_SCRIPT_EMAIL_URL is not configured on this deployment.',
    }, { status: 500 })
  }

  const { data: project } = await admin
    .from('projects')
    .select('id, name, start_date, end_date')
    .eq('id', parsed.data.project_id)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const istOffset = 5.5 * 60 * 60 * 1000
  const nowIST = new Date(new Date().getTime() + istOffset)
  const today = nowIST.toISOString().slice(0, 10)

  // PostgREST caps a single response at 1000 rows; page the tasks read so a
  // project with more than 1000 tasks still gets a complete digest preview.
  type DigestTaskRow = ProjectDigestTask & { owner_id: string | null; project_id: string }
  const tasksPromise = (async (): Promise<DigestTaskRow[]> => {
    const PAGE = 1000
    const out: DigestTaskRow[] = []
    for (let from = 0; ; from += PAGE) {
      const { data } = await admin
        .from('project_tasks')
        .select('id, project_id, owner_id, title, status, priority, progress, start_date, due_date, dependency_task, dependency_status')
        .eq('project_id', project.id)
        .range(from, from + PAGE - 1)
      if (!data || data.length === 0) break
      out.push(...(data as DigestTaskRow[]))
      if (data.length < PAGE) break
    }
    return out
  })()

  const [
    { data: owners },
    tasksRaw,
    { data: profiles },
  ] = await Promise.all([
    admin.from('project_owners')
      .select('id, project_id, user_id, department')
      .eq('project_id', project.id),
    tasksPromise,
    admin.from('profiles').select('id, full_name'),
  ])

  const profileById = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
  const tasksByOwner: Record<string, ProjectDigestTask[]> = {}
  for (const t of tasksRaw) {
    if (!t.owner_id) continue
    if (!tasksByOwner[t.owner_id]) tasksByOwner[t.owner_id] = []
    tasksByOwner[t.owner_id].push(t as ProjectDigestTask)
  }

  const digestData = buildAdminProjectDigest({
    project,
    owners: owners ?? [],
    tasksByOwner,
    profileById,
    today,
  })

  const html = adminProjectDigestEmailHtml({
    adminName: profile.full_name,
    today,
    appUrl,
    project: digestData,
  })

  await sendEmail(to, `[TEST] [${project.name}] Daily project digest — ${today}`, html)

  return NextResponse.json({ sent: true, to, project: project.name })
}
