import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, dailyTaskSummaryEmailHtml } from '@/lib/email'

// Called by Vercel Cron daily at 14:00 UTC (7:30 PM IST)
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

  // Today in IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000
  const todayIST = new Date(new Date().getTime() + istOffset)
  const todayDate = todayIST.toISOString().slice(0, 10)

  // Fetch all tasks due today for non-admin members
  const { data: tasks, error: taskError } = await admin
    .from('tasks')
    .select('id, title, priority, category, status, score_weight, user_id, completion_date')
    .eq('due_date', todayDate)
    .eq('is_draft', false)
    .is('parent_task_id', null) // exclude dependency sub-tasks

  if (taskError) return NextResponse.json({ error: taskError.message }, { status: 500 })
  if (!tasks?.length) {
    return NextResponse.json({ sent: false, reason: 'No tasks due today' })
  }

  // Fetch profiles for all task owners
  const userIds = [...new Set(tasks.map(t => t.user_id))]
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, designation, department, role')
    .in('id', userIds)

  // Filter to member profiles only
  const memberProfiles = (profiles ?? []).filter(p => p.role === 'member')
  const memberIds = new Set(memberProfiles.map(p => p.id))
  const profileById = Object.fromEntries(memberProfiles.map(p => [p.id, p]))

  // Split tasks into completed / incomplete, skip admin tasks
  const memberTasks = tasks.filter(t => memberIds.has(t.user_id))
  const completedTasks = memberTasks.filter(t => t.status === 'done')
  const incompleteTasks = memberTasks.filter(t => t.status !== 'done')

  if (!memberTasks.length) {
    return NextResponse.json({ sent: false, reason: 'No member tasks due today' })
  }

  // Group by department → member
  type MemberData = {
    full_name: string
    designation: string | null
    department: string | null
    completed: typeof completedTasks
    incomplete: typeof incompleteTasks
  }

  const memberMap: Record<string, MemberData> = {}
  for (const p of memberProfiles) {
    memberMap[p.id] = { full_name: p.full_name, designation: p.designation, department: p.department, completed: [], incomplete: [] }
  }
  for (const t of completedTasks)  if (memberMap[t.user_id]) memberMap[t.user_id].completed.push(t)
  for (const t of incompleteTasks) if (memberMap[t.user_id]) memberMap[t.user_id].incomplete.push(t)

  // Only include members with at least one task due today
  const activeMemberIds = Object.keys(memberMap).filter(
    id => memberMap[id].completed.length + memberMap[id].incomplete.length > 0
  )

  // Group by department
  const byDept: Record<string, MemberData[]> = {}
  for (const id of activeMemberIds) {
    const m = memberMap[id]
    const dept = m.department ?? 'No Department'
    if (!byDept[dept]) byDept[dept] = []
    byDept[dept].push(m)
  }
  for (const dept of Object.keys(byDept)) {
    byDept[dept].sort((a, b) => a.full_name.localeCompare(b.full_name))
  }

  // Build email
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const dateLabel = todayIST.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const html = dailyTaskSummaryEmailHtml(dateLabel, byDept, completedTasks.length, incompleteTasks.length, appUrl)
  const subject = `Daily Task Summary — ${todayIST.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`

  // Fetch admin emails from auth
  const { data: { users: allUsers } } = await admin.auth.admin.listUsers({ perPage: 200 })
  const adminProfileIds = new Set(
    (profiles ?? []).filter(p => p.role === 'admin').map(p => p.id)
  )
  const adminEmails = allUsers
    .filter(u => adminProfileIds.has(u.id) && u.email)
    .map(u => u.email as string)

  if (!adminEmails.length) {
    return NextResponse.json({ sent: false, reason: 'No admin emails found' })
  }

  // Send one email per admin
  await Promise.all(adminEmails.map(email => sendEmail(email, subject, html)))

  return NextResponse.json({
    success: true,
    date: todayDate,
    sentTo: adminEmails,
    stats: { completed: completedTasks.length, incomplete: incompleteTasks.length },
  })
}
