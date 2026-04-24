import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, memberDailyDigestEmailHtml } from '@/lib/email'

// Called by Vercel Cron daily at 03:30 UTC (9:00 AM IST)
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

  // Compute today and yesterday in IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000
  const nowIST = new Date(new Date().getTime() + istOffset)
  const todayDate = nowIST.toISOString().slice(0, 10)

  const yesterdayIST = new Date(nowIST)
  yesterdayIST.setDate(yesterdayIST.getDate() - 1)
  const yesterdayDate = yesterdayIST.toISOString().slice(0, 10)

  // IST midnight boundaries expressed as UTC ISO strings for approved_at range
  const todayIST_startUTC = new Date(`${todayDate}T00:00:00+05:30`).toISOString()
  const yesterdayIST_startUTC = new Date(`${yesterdayDate}T00:00:00+05:30`).toISOString()

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

  // Batch fetch all data across all members in parallel
  const [
    { data: dueTodayAll },
    { data: overdueAll },
    { data: pendingApprovalsAll },
    { data: approvedYesterdayAll },
  ] = await Promise.all([
    // Tasks due today — not done
    admin.from('tasks')
      .select('id, title, priority, category, score_weight, status, due_date, user_id')
      .in('user_id', memberIds)
      .eq('due_date', todayDate)
      .eq('is_draft', false)
      .is('parent_task_id', null)
      .neq('status', 'done'),

    // Overdue tasks — past due, not done
    admin.from('tasks')
      .select('id, title, priority, category, score_weight, status, due_date, user_id')
      .in('user_id', memberIds)
      .lt('due_date', todayDate)
      .eq('is_draft', false)
      .is('parent_task_id', null)
      .neq('status', 'done'),

    // Tasks assigned BY a member, completed by assignee, awaiting the assigning member's approval
    admin.from('tasks')
      .select('id, title, priority, category, score_weight, status, user_id, assigned_by')
      .in('assigned_by', memberIds)
      .eq('approval_status', 'pending_approval')
      .eq('status', 'done')
      .eq('is_draft', false),

    // Tasks belonging to members that were approved yesterday
    admin.from('tasks')
      .select('id, title, priority, score_weight, score_earned, approved_at, approved_by, approval_note, user_id')
      .in('user_id', memberIds)
      .eq('approval_status', 'approved')
      .gte('approved_at', yesterdayIST_startUTC)
      .lt('approved_at', todayIST_startUTC),
  ])

  // Fetch profiles for task owners in pending approvals (to show "Completed by X")
  const pendingOwnerIds = [...new Set((pendingApprovalsAll ?? []).map(t => t.user_id))]
  const pendingOwnerById: Record<string, { full_name: string; designation: string | null }> = {}
  if (pendingOwnerIds.length) {
    const { data: ownerProfiles } = await admin.from('profiles')
      .select('id, full_name, designation')
      .in('id', pendingOwnerIds)
    for (const p of ownerProfiles ?? []) pendingOwnerById[p.id] = p
  }

  // Fetch approver profiles (to split admin vs peer)
  const approverIds = [...new Set(
    (approvedYesterdayAll ?? []).map(t => t.approved_by).filter(Boolean) as string[]
  )]
  const approverById: Record<string, { full_name: string; role: string }> = {}
  if (approverIds.length) {
    const { data: approverProfiles } = await admin.from('profiles')
      .select('id, full_name, role')
      .in('id', approverIds)
    for (const p of approverProfiles ?? []) approverById[p.id] = p
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const dateLabel = nowIST.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  let sentCount = 0

  for (const member of memberProfiles) {
    const email = memberEmailById[member.id]
    if (!email) continue

    const dueTodayTasks  = (dueTodayAll ?? []).filter(t => t.user_id === member.id)
    const overdueTasks   = (overdueAll ?? []).filter(t => t.user_id === member.id)
    const pendingApprovals = (pendingApprovalsAll ?? [])
      .filter(t => t.assigned_by === member.id)
      .map(t => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        score_weight: t.score_weight,
        assignee: pendingOwnerById[t.user_id] ?? null,
      }))

    const approvedYesterday = (approvedYesterdayAll ?? []).filter(t => t.user_id === member.id)
    const approvedByPeer = approvedYesterday
      .filter(t => t.approved_by && approverById[t.approved_by]?.role === 'member')
      .map(t => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        score_earned: t.score_earned ?? 0,
        approved_at: t.approved_at,
        approval_note: t.approval_note ?? null,
        approver: t.approved_by ? (approverById[t.approved_by] ?? null) : null,
      }))
    const approvedByAdmin = approvedYesterday
      .filter(t => t.approved_by && approverById[t.approved_by]?.role === 'admin')
      .map(t => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        score_earned: t.score_earned ?? 0,
        approved_at: t.approved_at,
        approval_note: t.approval_note ?? null,
        approver: t.approved_by ? (approverById[t.approved_by] ?? null) : null,
      }))

    const hasData =
      dueTodayTasks.length > 0 ||
      overdueTasks.length > 0 ||
      pendingApprovals.length > 0 ||
      approvedYesterday.length > 0

    if (!hasData) continue

    const html = memberDailyDigestEmailHtml({
      memberName: member.full_name,
      dateLabel,
      dueTodayTasks,
      overdueTasks,
      pendingApprovals,
      approvedByPeer,
      approvedByAdmin,
      appUrl,
    })

    const subject = `Your Daily Task Digest — ${nowIST.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
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
