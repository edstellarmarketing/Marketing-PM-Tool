import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  sendEmail,
  projectOwnerDigestEmailHtml,
  adminProjectPortfolioDigestEmailHtml,
  type ProjectDigestTask,
  type ProjectDigestOwnerSummary,
} from '@/lib/email'

// Called by Vercel Cron daily at 02:30 UTC (08:00 IST)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  // IST today
  const istOffset = 5.5 * 60 * 60 * 1000
  const nowIST = new Date(new Date().getTime() + istOffset)
  const today = nowIST.toISOString().slice(0, 10)

  // 1. Projects with email notifications enabled
  const { data: projects, error: projectsErr } = await admin
    .from('projects')
    .select('id, name, start_date, end_date, notify_email_enabled')
    .eq('notify_email_enabled', true)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })

  if (projectsErr) {
    return NextResponse.json({ error: projectsErr.message }, { status: 500 })
  }
  if (!projects || projects.length === 0) {
    return NextResponse.json({ skipped: true, reason: 'No projects with notifications enabled' })
  }

  const projectIds = projects.map(p => p.id)

  // 2. Parallel fetch
  const [
    { data: ownersRaw },
    { data: tasksRaw },
    { data: profiles },
    { data: { users: authUsers } },
  ] = await Promise.all([
    admin.from('project_owners')
      .select('id, project_id, user_id, department')
      .in('project_id', projectIds),
    admin.from('project_tasks')
      .select('id, project_id, owner_id, title, status, priority, progress, start_date, due_date, dependency_task, dependency_status')
      .in('project_id', projectIds),
    admin.from('profiles').select('id, full_name, role, is_active'),
    admin.auth.admin.listUsers({ perPage: 500 }),
  ])

  const profileById: Record<string, { full_name: string; role: 'admin' | 'member'; is_active: boolean }> =
    Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
  const emailById: Record<string, string> = {}
  for (const u of authUsers ?? []) {
    if (u.email && u.id) emailById[u.id] = u.email
  }

  const owners = ownersRaw ?? []
  const tasks = tasksRaw ?? []

  // Index helpers
  const ownersByProject: Record<string, typeof owners> = {}
  for (const o of owners) {
    if (!ownersByProject[o.project_id]) ownersByProject[o.project_id] = []
    ownersByProject[o.project_id].push(o)
  }
  const tasksByOwner: Record<string, ProjectDigestTask[]> = {}
  for (const t of tasks) {
    if (!t.owner_id) continue
    if (!tasksByOwner[t.owner_id]) tasksByOwner[t.owner_id] = []
    tasksByOwner[t.owner_id].push(t as ProjectDigestTask)
  }

  function statsFor(taskList: ProjectDigestTask[]): { total: number; completed: number; in_progress: number; pending: number; overdue: number; progressPct: number } {
    let total = 0, completed = 0, in_progress = 0, pending = 0, overdue = 0
    for (const t of taskList) {
      total += 1
      if (t.status === 'completed') completed += 1
      else if (t.status === 'in_progress') in_progress += 1
      else pending += 1
      if (t.status !== 'completed' && t.due_date && t.due_date < today) overdue += 1
    }
    return { total, completed, in_progress, pending, overdue, progressPct: total === 0 ? 0 : Math.round((completed / total) * 100) }
  }

  // 3. Send owner digests
  let ownerEmailsSent = 0
  const adminProjectsBuckets: NonNullable<Parameters<typeof adminProjectPortfolioDigestEmailHtml>[0]['projects']>[number][] = []

  for (const project of projects) {
    const projectOwners = ownersByProject[project.id] ?? []
    const projectTasks: ProjectDigestTask[] = []
    for (const o of projectOwners) {
      projectTasks.push(...(tasksByOwner[o.id] ?? []))
    }
    const projectStats = statsFor(projectTasks)

    const ownerSummaries: ProjectDigestOwnerSummary[] = []

    for (const owner of projectOwners) {
      const ownerTasks = tasksByOwner[owner.id] ?? []
      const ownerStats = statsFor(ownerTasks)
      const ownerProfile = profileById[owner.user_id]
      const ownerName = ownerProfile?.full_name ?? 'Owner'

      ownerSummaries.push({
        ownerName,
        department: owner.department,
        ...ownerStats,
      })

      if (!ownerProfile?.is_active) continue
      const email = emailById[owner.user_id]
      if (!email) continue

      const dueToday = ownerTasks.filter(t => t.status !== 'completed' && t.due_date === today)
      const overdue = ownerTasks.filter(t => t.status !== 'completed' && t.due_date && t.due_date < today)
      const inProgress = ownerTasks.filter(t => t.status === 'in_progress').slice(0, 15)
      const blockedByDeps = ownerTasks.filter(t => t.status !== 'completed' && !!t.dependency_task)

      // Skip empty digests so we don't spam owners with nothing-to-do mails
      if (ownerStats.total === 0) continue

      const html = projectOwnerDigestEmailHtml({
        ownerName,
        projectName: project.name,
        projectUrl: `${appUrl}/projects/${project.id}`,
        department: owner.department,
        today,
        summary: ownerSummaries[ownerSummaries.length - 1],
        dueToday,
        overdue,
        inProgress,
        blockedByDeps,
      })

      await sendEmail(email, `[${project.name}] Daily digest — ${owner.department}`, html)
      ownerEmailsSent += 1
    }

    adminProjectsBuckets.push({
      id: project.id,
      name: project.name,
      startDate: project.start_date,
      endDate: project.end_date,
      ...projectStats,
      owners: ownerSummaries.sort((a, b) => a.department.localeCompare(b.department)),
    })
  }

  // 4. Send admin consolidated digest
  const adminProfiles = (profiles ?? []).filter(p => p.role === 'admin' && p.is_active)
  let adminEmailsSent = 0

  for (const a of adminProfiles) {
    const email = emailById[a.id]
    if (!email) continue
    const html = adminProjectPortfolioDigestEmailHtml({
      adminName: a.full_name,
      today,
      appUrl,
      projects: adminProjectsBuckets,
    })
    await sendEmail(email, `Project portfolio digest — ${today}`, html)
    adminEmailsSent += 1
  }

  return NextResponse.json({
    projects: projects.length,
    ownerEmailsSent,
    adminEmailsSent,
  })
}
