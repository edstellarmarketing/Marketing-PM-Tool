import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, memberDailyDigestEmailHtml } from '@/lib/email'

// Called by Vercel Cron daily at 01:30 UTC (7:00 AM IST)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: setting } = await admin
    .from('email_settings')
    .select('enabled')
    .eq('key', 'member_daily_digest')
    .single()

  if (!setting?.enabled) {
    return NextResponse.json({ skipped: true, reason: 'member_daily_digest disabled' })
  }

  // Dates in IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000
  const nowIST = new Date(new Date().getTime() + istOffset)
  const todayDate = nowIST.toISOString().slice(0, 10)

  const yesterdayIST = new Date(nowIST)
  yesterdayIST.setDate(yesterdayIST.getDate() - 1)
  const yesterdayDate = yesterdayIST.toISOString().slice(0, 10)

  const firstOfMonth = `${todayDate.slice(0, 8)}01`

  // Fetch all active members
  const { data: memberProfiles } = await admin
    .from('profiles')
    .select('id, full_name, designation, department')
    .eq('role', 'member')
    .eq('is_active', true)

  if (!memberProfiles?.length) {
    return NextResponse.json({ skipped: true, reason: 'No active members' })
  }

  const memberIds = memberProfiles.map(p => p.id)

  // Resolve member emails from auth
  const { data: { users: allAuthUsers } } = await admin.auth.admin.listUsers({ perPage: 200 })
  const memberEmailById: Record<string, string> = {}
  for (const u of allAuthUsers) {
    if (u.email && memberIds.includes(u.id)) memberEmailById[u.id] = u.email
  }

  // Batch fetch all data in parallel
  const [
    { data: dueTodayAll },
    { data: missedYesterdayAll },
    { data: monthlyAll },
    { data: pendingApprovalsAll },
  ] = await Promise.all([
    // Tasks due today — not done
    admin.from('tasks')
      .select('id, title, priority, category, score_weight, status, due_date, user_id')
      .in('user_id', memberIds)
      .eq('due_date', todayDate)
      .eq('is_draft', false)
      .is('parent_task_id', null)
      .neq('status', 'done'),

    // Tasks due yesterday, still not done (scope narrowed from all overdue to yesterday only)
    admin.from('tasks')
      .select('id, title, priority, category, score_weight, status, due_date, user_id')
      .in('user_id', memberIds)
      .eq('due_date', yesterdayDate)
      .eq('is_draft', false)
      .is('parent_task_id', null)
      .neq('status', 'done'),

    // All tasks this month for monthly progress stats
    admin.from('tasks')
      .select('id, status, due_date, user_id')
      .in('user_id', memberIds)
      .gte('due_date', firstOfMonth)
      .lte('due_date', todayDate)
      .eq('is_draft', false)
      .is('parent_task_id', null),

    // Tasks this member assigned as dependencies, completed, awaiting their approval
    admin.from('tasks')
      .select('id, title, priority, category, score_weight, status, user_id, assigned_by')
      .in('assigned_by', memberIds)
      .eq('approval_status', 'pending_approval')
      .eq('status', 'done')
      .eq('is_draft', false),
  ])

  // Fetch profiles for assignees in pending approvals (to show "Completed by X")
  const pendingOwnerIds = [...new Set((pendingApprovalsAll ?? []).map(t => t.user_id))]
  const pendingOwnerById: Record<string, { full_name: string; designation: string | null }> = {}
  if (pendingOwnerIds.length) {
    const { data: ownerProfiles } = await admin.from('profiles')
      .select('id, full_name, designation')
      .in('id', pendingOwnerIds)
    for (const p of ownerProfiles ?? []) pendingOwnerById[p.id] = p
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const dateLabel = nowIST.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const monthLabel = nowIST.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  let sentCount = 0

  for (const member of memberProfiles) {
    const email = memberEmailById[member.id]
    if (!email) continue

    const dueTodayTasks = (dueTodayAll ?? []).filter(t => t.user_id === member.id)
    const missedYesterdayTasks = (missedYesterdayAll ?? []).filter(t => t.user_id === member.id)

    const myMonthly = (monthlyAll ?? []).filter(t => t.user_id === member.id)
    const monthlyDone = myMonthly.filter(t => t.status === 'done').length
    const monthlyTotal = myMonthly.length
    const monthlyPending = monthlyTotal - monthlyDone

    const pendingApprovals = (pendingApprovalsAll ?? [])
      .filter(t => t.assigned_by === member.id)
      .map(t => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        score_weight: t.score_weight,
        assignee: pendingOwnerById[t.user_id] ?? null,
      }))

    const hasData =
      dueTodayTasks.length > 0 ||
      missedYesterdayTasks.length > 0 ||
      monthlyTotal > 0 ||
      pendingApprovals.length > 0

    if (!hasData) continue

    const html = memberDailyDigestEmailHtml({
      memberName: member.full_name,
      dateLabel,
      dueTodayTasks,
      missedYesterdayTasks,
      monthlyProgress: {
        monthLabel,
        total: monthlyTotal,
        done: monthlyDone,
        pending: monthlyPending,
      },
      pendingApprovals,
      appUrl,
    })

    const subject = `Your Daily Task Summary — ${nowIST.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
    await sendEmail(email, subject, html)
    sentCount++
  }

  return NextResponse.json({
    success: true,
    date: todayDate,
    membersEmailed: sentCount,
    totalMembers: memberProfiles.length,
  })
}
