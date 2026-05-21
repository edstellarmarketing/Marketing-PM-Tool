import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  sendEmail,
  projectOwnerDigestEmailHtml,
  adminProjectDigestEmailHtml,
  type ProjectDigestTask,
} from '@/lib/email'
import { buildAdminProjectDigest } from '@/lib/project-digest'

// Vercel Cron: 02:30 UTC daily = 08:00 IST
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  const istOffset = 5.5 * 60 * 60 * 1000
  const nowIST = new Date(new Date().getTime() + istOffset)
  const today = nowIST.toISOString().slice(0, 10)

  const { data: projects, error: projectsErr } = await admin
    .from('projects')
    .select('id, name, start_date, end_date, notify_email_enabled')
    .eq('notify_email_enabled', true)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })

  if (projectsErr) return NextResponse.json({ error: projectsErr.message }, { status: 500 })
  if (!projects || projects.length === 0) {
    return NextResponse.json({ skipped: true, reason: 'No projects with notifications enabled' })
  }

  const projectIds = projects.map(p => p.id)

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

  function statsFor(taskList: ProjectDigestTask[]) {
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

  const adminProfiles = (profiles ?? []).filter(p => p.role === 'admin' && p.is_active)

  let ownerEmailsSent = 0
  let adminEmailsSent = 0

  for (const project of projects) {
    const projectOwners = ownersByProject[project.id] ?? []

    // Per-owner mail — same as before
    for (const owner of projectOwners) {
      const ownerTasks = tasksByOwner[owner.id] ?? []
      const ownerStats = statsFor(ownerTasks)
      const ownerProfile = profileById[owner.user_id]
      if (!ownerProfile?.is_active) continue
      const email = emailById[owner.user_id]
      if (!email) continue
      if (ownerStats.total === 0) continue

      const dueToday = ownerTasks.filter(t => t.status !== 'completed' && t.due_date === today)
      const overdueList = ownerTasks.filter(t => t.status !== 'completed' && t.due_date && t.due_date < today)
      const inProgress = ownerTasks.filter(t => t.status === 'in_progress').slice(0, 15)
      const blockedByDeps = ownerTasks.filter(t => t.status !== 'completed' && !!t.dependency_task)

      const html = projectOwnerDigestEmailHtml({
        ownerName: ownerProfile.full_name,
        projectName: project.name,
        projectUrl: `${appUrl}/projects/${project.id}`,
        department: owner.department,
        today,
        summary: { ownerName: ownerProfile.full_name, department: owner.department, ...ownerStats },
        dueToday,
        overdue: overdueList,
        inProgress,
        blockedByDeps,
      })
      await sendEmail(email, `[${project.name}] Daily digest — ${owner.department}`, html)
      ownerEmailsSent += 1
    }

    // Per-project admin mail
    const digestData = buildAdminProjectDigest({
      project,
      owners: projectOwners,
      tasksByOwner,
      profileById,
      today,
    })
    if (digestData.total === 0) continue

    for (const a of adminProfiles) {
      const email = emailById[a.id]
      if (!email) continue
      const html = adminProjectDigestEmailHtml({
        adminName: a.full_name,
        today,
        appUrl,
        project: digestData,
      })
      await sendEmail(email, `[${project.name}] Daily project digest — ${today}`, html)
      adminEmailsSent += 1
    }
  }

  return NextResponse.json({ projects: projects.length, ownerEmailsSent, adminEmailsSent })
}
