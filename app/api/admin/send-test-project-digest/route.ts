import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/api'
import {
  sendEmail,
  adminProjectPortfolioDigestEmailHtml,
  type ProjectDigestOwnerSummary,
  type ProjectDigestTask,
} from '@/lib/email'

// Sends the same admin portfolio digest the cron sends, but only to the
// calling admin's email — useful for previewing what the daily mail will
// look like. Admin only.
export async function POST() {
  const { profile, error } = await requireAdmin()
  if (error || !profile) return error ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  // Resolve the caller's email from auth.users
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

  // IST today
  const istOffset = 5.5 * 60 * 60 * 1000
  const nowIST = new Date(new Date().getTime() + istOffset)
  const today = nowIST.toISOString().slice(0, 10)

  const { data: projects } = await admin
    .from('projects')
    .select('id, name, start_date, end_date')
    .eq('notify_email_enabled', true)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })

  const projectIds = (projects ?? []).map(p => p.id)

  const [
    { data: ownersRaw },
    { data: tasksRaw },
    { data: profiles },
  ] = await Promise.all([
    admin.from('project_owners')
      .select('id, project_id, user_id, department')
      .in('project_id', projectIds.length ? projectIds : ['00000000-0000-0000-0000-000000000000']),
    admin.from('project_tasks')
      .select('id, project_id, owner_id, title, status, priority, progress, start_date, due_date, dependency_task, dependency_status')
      .in('project_id', projectIds.length ? projectIds : ['00000000-0000-0000-0000-000000000000']),
    admin.from('profiles').select('id, full_name'),
  ])

  const profileById = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  const ownersByProject: Record<string, NonNullable<typeof ownersRaw>> = {}
  for (const o of ownersRaw ?? []) {
    if (!ownersByProject[o.project_id]) ownersByProject[o.project_id] = []
    ownersByProject[o.project_id].push(o)
  }
  const tasksByOwner: Record<string, ProjectDigestTask[]> = {}
  for (const t of tasksRaw ?? []) {
    if (!t.owner_id) continue
    if (!tasksByOwner[t.owner_id]) tasksByOwner[t.owner_id] = []
    tasksByOwner[t.owner_id].push(t as ProjectDigestTask)
  }

  function statsFor(list: ProjectDigestTask[]) {
    let total = 0, completed = 0, in_progress = 0, pending = 0, overdue = 0
    for (const t of list) {
      total += 1
      if (t.status === 'completed') completed += 1
      else if (t.status === 'in_progress') in_progress += 1
      else pending += 1
      if (t.status !== 'completed' && t.due_date && t.due_date < today) overdue += 1
    }
    return { total, completed, in_progress, pending, overdue, progressPct: total === 0 ? 0 : Math.round((completed / total) * 100) }
  }

  const adminBuckets: Parameters<typeof adminProjectPortfolioDigestEmailHtml>[0]['projects'] = []
  for (const project of projects ?? []) {
    const owners = ownersByProject[project.id] ?? []
    const projectTasks: ProjectDigestTask[] = []
    const ownerSummaries: ProjectDigestOwnerSummary[] = []
    for (const o of owners) {
      const ownerTasks = tasksByOwner[o.id] ?? []
      projectTasks.push(...ownerTasks)
      ownerSummaries.push({
        ownerName: profileById[o.user_id]?.full_name ?? 'Owner',
        department: o.department,
        ...statsFor(ownerTasks),
      })
    }
    adminBuckets.push({
      id: project.id,
      name: project.name,
      startDate: project.start_date,
      endDate: project.end_date,
      ...statsFor(projectTasks),
      owners: ownerSummaries.sort((a, b) => a.department.localeCompare(b.department)),
    })
  }

  const html = adminProjectPortfolioDigestEmailHtml({
    adminName: profile.full_name,
    today,
    appUrl,
    projects: adminBuckets,
  })

  await sendEmail(to, `[TEST] Project portfolio digest — ${today}`, html)

  return NextResponse.json({ sent: true, to, projects: adminBuckets.length })
}
