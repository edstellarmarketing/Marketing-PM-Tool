import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, dailyTaskSummaryEmailHtml } from '@/lib/email'
import type { AdminTaskWithOwner, AdminPendingApproval, DeptMonthlyStats } from '@/lib/email'

// Called by Vercel Cron daily at 02:00 UTC (7:30 AM IST)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: setting } = await admin
    .from('email_settings')
    .select('enabled')
    .eq('key', 'admin_daily_task_summary')
    .single()

  if (!setting?.enabled) {
    return NextResponse.json({ skipped: true, reason: 'admin_daily_task_summary disabled' })
  }

  // Dates in IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000
  const nowIST = new Date(new Date().getTime() + istOffset)
  const todayDate = nowIST.toISOString().slice(0, 10)

  const yesterdayIST = new Date(nowIST)
  yesterdayIST.setDate(yesterdayIST.getDate() - 1)
  const yesterdayDate = yesterdayIST.toISOString().slice(0, 10)

  const firstOfMonth = `${todayDate.slice(0, 8)}01`

  // All profiles (member + admin needed for admin email list)
  const { data: allProfiles } = await admin
    .from('profiles')
    .select('id, full_name, designation, department, role')

  const memberProfiles = (allProfiles ?? []).filter(p => p.role === 'member')
  const memberIds = new Set(memberProfiles.map(p => p.id))
  const profileById = Object.fromEntries(memberProfiles.map(p => [p.id, p]))

  // Parallel data fetches
  const [
    { data: dueTodayRaw },
    { data: dueYesterdayRaw },
    { data: monthlyRaw },
    { data: pendingApprovalsRaw },
  ] = await Promise.all([
    // 1. Active tasks due today (not done)
    admin.from('tasks')
      .select('id, title, priority, category, score_weight, status, due_date, user_id')
      .eq('due_date', todayDate)
      .neq('status', 'done')
      .eq('is_draft', false)
      .is('parent_task_id', null),

    // 2. Tasks due yesterday that are still not done
    admin.from('tasks')
      .select('id, title, priority, category, score_weight, status, due_date, user_id')
      .eq('due_date', yesterdayDate)
      .neq('status', 'done')
      .eq('is_draft', false)
      .is('parent_task_id', null),

    // 3. All tasks for this month (for dept stats)
    admin.from('tasks')
      .select('id, status, due_date, user_id')
      .gte('due_date', firstOfMonth)
      .lte('due_date', todayDate)
      .eq('is_draft', false)
      .is('parent_task_id', null),

    // 4. All pending admin approvals (tasks submitted for score approval)
    admin.from('tasks')
      .select('id, title, priority, score_weight, completion_date, updated_at, user_id')
      .eq('approval_status', 'pending_approval')
      .eq('status', 'done')
      .eq('is_draft', false)
      .is('parent_task_id', null)
      .order('completion_date', { ascending: true }),
  ])

  // Build section 1 — due today tasks with owner
  const dueTodayTasks: AdminTaskWithOwner[] = (dueTodayRaw ?? [])
    .filter(t => memberIds.has(t.user_id))
    .map(t => ({ ...t, owner: profileById[t.user_id] ?? null }))
    .sort((a, b) => a.owner?.full_name.localeCompare(b.owner?.full_name ?? '') ?? 0)

  // Build section 2 — missed yesterday tasks with owner
  const overdueYesterdayTasks: AdminTaskWithOwner[] = (dueYesterdayRaw ?? [])
    .filter(t => memberIds.has(t.user_id))
    .map(t => ({ ...t, owner: profileById[t.user_id] ?? null }))
    .sort((a, b) => a.owner?.full_name.localeCompare(b.owner?.full_name ?? '') ?? 0)

  // Build section 3 — monthly dept stats
  const deptStatsMap: Record<string, { total: number; done: number; pending: number }> = {}
  for (const t of (monthlyRaw ?? []).filter(t => memberIds.has(t.user_id))) {
    const dept = profileById[t.user_id]?.department ?? 'No Department'
    if (!deptStatsMap[dept]) deptStatsMap[dept] = { total: 0, done: 0, pending: 0 }
    deptStatsMap[dept].total++
    if (t.status === 'done') deptStatsMap[dept].done++
    else deptStatsMap[dept].pending++
  }
  const monthlyByDept: DeptMonthlyStats[] = Object.entries(deptStatsMap)
    .map(([department, s]) => ({ department, ...s }))
    .sort((a, b) => a.department.localeCompare(b.department))

  // Build section 4 — pending admin approvals
  const pendingApprovals: AdminPendingApproval[] = (pendingApprovalsRaw ?? [])
    .filter(t => memberIds.has(t.user_id))
    .map(t => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      score_weight: t.score_weight,
      submitted_at: t.completion_date ?? t.updated_at,
      owner: profileById[t.user_id] ?? null,
    }))

  // Build and send email
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const dateLabel = nowIST.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const monthLabel = nowIST.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  const html = dailyTaskSummaryEmailHtml({
    dateLabel,
    monthLabel,
    appUrl,
    dueTodayTasks,
    overdueYesterdayTasks,
    monthlyByDept,
    pendingApprovals,
  })

  const subject = `Daily Task Summary — ${nowIST.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`

  // Fetch admin emails
  const { data: { users: allUsers } } = await admin.auth.admin.listUsers({ perPage: 200 })
  const adminProfileIds = new Set((allProfiles ?? []).filter(p => p.role === 'admin').map(p => p.id))
  const adminEmails = allUsers
    .filter(u => adminProfileIds.has(u.id) && u.email)
    .map(u => u.email as string)

  if (!adminEmails.length) {
    return NextResponse.json({ sent: false, reason: 'No admin emails found' })
  }

  await Promise.all(adminEmails.map(email => sendEmail(email, subject, html)))

  return NextResponse.json({
    success: true,
    date: todayDate,
    sentTo: adminEmails,
    stats: {
      dueTodayCount: dueTodayTasks.length,
      overdueYesterdayCount: overdueYesterdayTasks.length,
      monthlyTasksCount: monthlyByDept.reduce((s, d) => s + d.total, 0),
      pendingApprovalsCount: pendingApprovals.length,
    },
  })
}
