import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/api'
import {
  sendEmail,
  projectOwnerDigestEmailHtml,
  type ProjectDigestTask,
} from '@/lib/email'
import { buildOwnerProjectDigest } from '@/lib/project-digest'
import { formatProjectName } from '@/lib/utils'

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

  if (!process.env.GOOGLE_APPS_SCRIPT_EMAIL_URL) {
    return NextResponse.json({
      error: 'GOOGLE_APPS_SCRIPT_EMAIL_URL is not configured on this deployment.',
    }, { status: 500 })
  }

  const { data: { user: authUser }, error: userErr } = await admin.auth.admin.getUserById(profile.id)
  if (userErr || !authUser?.email) {
    return NextResponse.json({ error: 'Could not resolve your email address' }, { status: 500 })
  }
  const to = authUser.email

  const { data: project } = await admin
    .from('projects')
    .select('id, name, domain, start_date, end_date')
    .eq('id', parsed.data.project_id)
    .single()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  const displayName = formatProjectName(project)

  const { data: owners } = await admin
    .from('project_owners')
    .select('id, project_id, user_id, department')
    .eq('project_id', project.id)
    .order('created_at', { ascending: true })

  if (!owners || owners.length === 0) {
    return NextResponse.json({ error: 'This project has no owners — nothing to preview.' }, { status: 400 })
  }

  // Prefer the calling admin's own owner record if they have one; else first owner.
  const targetOwner = owners.find(o => o.user_id === profile.id) ?? owners[0]
  const isPreviewForSomeoneElse = targetOwner.user_id !== profile.id

  // PostgREST caps a single response at 1000 rows; page the tasks read so an
  // owner with more than 1000 tasks still gets a complete digest preview.
  const tasksPromise = (async (): Promise<ProjectDigestTask[]> => {
    const PAGE = 1000
    const out: ProjectDigestTask[] = []
    for (let from = 0; ; from += PAGE) {
      const { data } = await admin
        .from('project_tasks')
        .select('id, project_id, owner_id, title, status, priority, progress, start_date, due_date, dependency_task, dependency_status')
        .eq('project_id', project.id)
        .eq('owner_id', targetOwner.id)
        .range(from, from + PAGE - 1)
      if (!data || data.length === 0) break
      out.push(...(data as ProjectDigestTask[]))
      if (data.length < PAGE) break
    }
    return out
  })()

  const [tasks, { data: profiles }] = await Promise.all([
    tasksPromise,
    admin.from('profiles').select('id, full_name').eq('id', targetOwner.user_id),
  ])

  const ownerProfileName = profiles?.[0]?.full_name ?? 'Owner'

  const istOffset = 5.5 * 60 * 60 * 1000
  const nowIST = new Date(new Date().getTime() + istOffset)
  const today = nowIST.toISOString().slice(0, 10)

  const digest = buildOwnerProjectDigest({ owner: targetOwner, tasks, today })

  const html = projectOwnerDigestEmailHtml({
    ownerName: ownerProfileName,
    projectName: displayName,
    projectUrl: `${appUrl}/projects/${project.id}`,
    department: targetOwner.department,
    today,
    summary: { ...digest.summary, ownerName: ownerProfileName },
    pendingToday: digest.pendingToday,
    upcoming: digest.upcoming,
  })

  const suffix = isPreviewForSomeoneElse ? ` (preview of ${ownerProfileName}'s digest)` : ''
  await sendEmail(to, `[TEST] [${displayName}] ${targetOwner.department} digest${suffix}`, html)

  return NextResponse.json({
    sent: true,
    to,
    department: targetOwner.department,
    previewedOwner: ownerProfileName,
    preview: isPreviewForSomeoneElse,
  })
}
