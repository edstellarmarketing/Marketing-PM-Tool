import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  sendEmail,
  projectOwnerDigestEmailHtml,
  adminProjectDigestEmailHtml,
  type ProjectDigestTask,
} from '@/lib/email'
import { buildAdminProjectDigest, buildOwnerProjectDigest } from '@/lib/project-digest'

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

  // Pull projects where EITHER flag is on; per-section gating below
  const { data: projects, error: projectsErr } = await admin
    .from('projects')
    .select('id, name, start_date, end_date, notify_email_enabled, notify_owner_email_enabled')
    .or('notify_email_enabled.eq.true,notify_owner_email_enabled.eq.true')
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

  const adminProfiles = (profiles ?? []).filter(p => p.role === 'admin' && p.is_active)

  let ownerEmailsSent = 0
  let adminEmailsSent = 0

  for (const project of projects) {
    const projectOwners = ownersByProject[project.id] ?? []

    // Owner mails (gated by notify_owner_email_enabled)
    if (project.notify_owner_email_enabled) {
      for (const owner of projectOwners) {
        const ownerProfile = profileById[owner.user_id]
        if (!ownerProfile?.is_active) continue
        const email = emailById[owner.user_id]
        if (!email) continue

        const ownerDigest = buildOwnerProjectDigest({
          owner,
          tasks: tasksByOwner[owner.id] ?? [],
          today,
        })
        if (ownerDigest.summary.total === 0) continue

        const html = projectOwnerDigestEmailHtml({
          ownerName: ownerProfile.full_name,
          projectName: project.name,
          projectUrl: `${appUrl}/projects/${project.id}`,
          department: owner.department,
          today,
          summary: ownerDigest.summary,
          pendingToday: ownerDigest.pendingToday,
          upcoming: ownerDigest.upcoming,
        })
        await sendEmail(email, `[${project.name}] Daily digest — ${owner.department}`, html)
        ownerEmailsSent += 1
      }
    }

    // Admin mail (gated by notify_email_enabled)
    if (project.notify_email_enabled) {
      const digestData = buildAdminProjectDigest({
        project,
        owners: projectOwners,
        tasksByOwner,
        profileById,
        today,
      })
      if (digestData.total > 0) {
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
    }
  }

  return NextResponse.json({ projects: projects.length, ownerEmailsSent, adminEmailsSent })
}
