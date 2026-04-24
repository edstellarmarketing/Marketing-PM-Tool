import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sendEmail, dailyTaskSummaryEmailHtml, memberDailyDigestEmailHtml } from '@/lib/email'
import type { AdminTaskWithOwner, AdminPendingApproval, DeptMonthlyStats } from '@/lib/email'
import { z } from 'zod'

const schema = z.discriminatedUnion('key', [
  z.object({ key: z.literal('admin_daily_task_summary') }),
  z.object({ key: z.literal('member_daily_digest'), memberId: z.string().uuid() }),
])

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const adminDb = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  const istOffset = 5.5 * 60 * 60 * 1000
  const nowIST = new Date(new Date().getTime() + istOffset)
  const todayDate = nowIST.toISOString().slice(0, 10)
  const dateLabel = nowIST.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const subjectDate = nowIST.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

  // ── Admin daily task summary test ───────────────────────────────────────────
  if (parsed.data.key === 'admin_daily_task_summary') {
    const supabase = await createClient()
    const { data: { user: callingUser } } = await supabase.auth.getUser()
    if (!callingUser?.email) return NextResponse.json({ error: 'Could not resolve your email' }, { status: 400 })

    const yesterdayIST = new Date(nowIST)
    yesterdayIST.setDate(yesterdayIST.getDate() - 1)
    const yesterdayDate = yesterdayIST.toISOString().slice(0, 10)
    const firstOfMonth = `${todayDate.slice(0, 8)}01`

    const { data: allProfiles } = await adminDb
      .from('profiles')
      .select('id, full_name, designation, department, role')

    const memberProfiles = (allProfiles ?? []).filter(p => p.role === 'member')
    const memberIds = new Set(memberProfiles.map(p => p.id))
    const profileById = Object.fromEntries(memberProfiles.map(p => [p.id, p]))

    const [
      { data: dueTodayRaw },
      { data: dueYesterdayRaw },
      { data: monthlyRaw },
      { data: pendingApprovalsRaw },
    ] = await Promise.all([
      adminDb.from('tasks').select('id, title, priority, category, score_weight, status, due_date, user_id')
        .eq('due_date', todayDate).neq('status', 'done').eq('is_draft', false).is('parent_task_id', null),
      adminDb.from('tasks').select('id, title, priority, category, score_weight, status, due_date, user_id')
        .eq('due_date', yesterdayDate).neq('status', 'done').eq('is_draft', false).is('parent_task_id', null),
      adminDb.from('tasks').select('id, status, due_date, user_id')
        .gte('due_date', firstOfMonth).lte('due_date', todayDate).eq('is_draft', false).is('parent_task_id', null),
      adminDb.from('tasks').select('id, title, priority, score_weight, completion_date, updated_at, user_id')
        .eq('approval_status', 'pending_approval').eq('status', 'done').eq('is_draft', false).is('parent_task_id', null)
        .order('completion_date', { ascending: true }),
    ])

    const dueTodayTasks: AdminTaskWithOwner[] = (dueTodayRaw ?? [])
      .filter((t: { user_id: string }) => memberIds.has(t.user_id))
      .map((t: { user_id: string }) => ({ ...t, owner: profileById[t.user_id] ?? null }))
      .sort((a: AdminTaskWithOwner, b: AdminTaskWithOwner) => (a.owner?.full_name ?? '').localeCompare(b.owner?.full_name ?? ''))

    const overdueYesterdayTasks: AdminTaskWithOwner[] = (dueYesterdayRaw ?? [])
      .filter((t: { user_id: string }) => memberIds.has(t.user_id))
      .map((t: { user_id: string }) => ({ ...t, owner: profileById[t.user_id] ?? null }))
      .sort((a: AdminTaskWithOwner, b: AdminTaskWithOwner) => (a.owner?.full_name ?? '').localeCompare(b.owner?.full_name ?? ''))

    const deptStatsMap: Record<string, { total: number; done: number; pending: number }> = {}
    for (const t of (monthlyRaw ?? []).filter((t: { user_id: string }) => memberIds.has(t.user_id))) {
      const dept = profileById[t.user_id]?.department ?? 'No Department'
      if (!deptStatsMap[dept]) deptStatsMap[dept] = { total: 0, done: 0, pending: 0 }
      deptStatsMap[dept].total++
      if (t.status === 'done') deptStatsMap[dept].done++
      else deptStatsMap[dept].pending++
    }
    const monthlyByDept: DeptMonthlyStats[] = Object.entries(deptStatsMap)
      .map(([department, s]) => ({ department, ...s }))
      .sort((a, b) => a.department.localeCompare(b.department))

    const pendingApprovals: AdminPendingApproval[] = (pendingApprovalsRaw ?? [])
      .filter((t: { user_id: string }) => memberIds.has(t.user_id))
      .map((t: { id: string; title: string; priority: string; score_weight: number; completion_date: string | null; updated_at: string; user_id: string }) => ({
        id: t.id, title: t.title, priority: t.priority, score_weight: t.score_weight,
        submitted_at: t.completion_date ?? t.updated_at,
        owner: profileById[t.user_id] ?? null,
      }))

    const monthLabel = nowIST.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    const html = dailyTaskSummaryEmailHtml({ dateLabel, monthLabel, appUrl, dueTodayTasks, overdueYesterdayTasks, monthlyByDept, pendingApprovals })
    await sendEmail(callingUser.email, `[TEST] Daily Task Summary — ${subjectDate}`, html)
    return NextResponse.json({ success: true, sentTo: callingUser.email })
  }

  // ── Member daily digest test ─────────────────────────────────────────────────
  const { memberId } = parsed.data

  const { data: memberProfile } = await adminDb
    .from('profiles')
    .select('id, full_name, designation, department')
    .eq('id', memberId)
    .single()

  if (!memberProfile) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  const { data: { users: authUsers } } = await adminDb.auth.admin.listUsers({ perPage: 200 })
  const memberAuthUser = authUsers.find(u => u.id === memberId)
  if (!memberAuthUser?.email) return NextResponse.json({ error: 'Member email not found' }, { status: 404 })

  const yesterdayIST = new Date(nowIST)
  yesterdayIST.setDate(yesterdayIST.getDate() - 1)
  const yesterdayDate = yesterdayIST.toISOString().slice(0, 10)
  const todayIST_startUTC = new Date(`${todayDate}T00:00:00+05:30`).toISOString()
  const yesterdayIST_startUTC = new Date(`${yesterdayDate}T00:00:00+05:30`).toISOString()

  const [
    { data: dueTodayTasks },
    { data: overdueTasks },
    { data: pendingApprovalsAll },
    { data: approvedYesterdayAll },
  ] = await Promise.all([
    adminDb.from('tasks').select('id, title, priority, category, score_weight, status, due_date, user_id')
      .eq('user_id', memberId).eq('due_date', todayDate).eq('is_draft', false).is('parent_task_id', null).neq('status', 'done'),
    adminDb.from('tasks').select('id, title, priority, category, score_weight, status, due_date, user_id')
      .eq('user_id', memberId).lt('due_date', todayDate).eq('is_draft', false).is('parent_task_id', null).neq('status', 'done'),
    adminDb.from('tasks').select('id, title, priority, score_weight, status, user_id, assigned_by')
      .eq('assigned_by', memberId).eq('approval_status', 'pending_approval').eq('status', 'done').eq('is_draft', false),
    adminDb.from('tasks').select('id, title, priority, score_weight, score_earned, approved_at, approved_by, approval_note, user_id')
      .eq('user_id', memberId).eq('approval_status', 'approved').gte('approved_at', yesterdayIST_startUTC).lt('approved_at', todayIST_startUTC),
  ])

  const pendingOwnerIds = [...new Set((pendingApprovalsAll ?? []).map(t => t.user_id))]
  const pendingOwnerById: Record<string, { full_name: string; designation: string | null }> = {}
  if (pendingOwnerIds.length) {
    const { data: ownerProfiles } = await adminDb.from('profiles').select('id, full_name, designation').in('id', pendingOwnerIds)
    for (const p of ownerProfiles ?? []) pendingOwnerById[p.id] = p
  }

  const approverIds = [...new Set((approvedYesterdayAll ?? []).map(t => t.approved_by).filter(Boolean) as string[])]
  const approverById: Record<string, { full_name: string; role: string }> = {}
  if (approverIds.length) {
    const { data: approverProfiles } = await adminDb.from('profiles').select('id, full_name, role').in('id', approverIds)
    for (const p of approverProfiles ?? []) approverById[p.id] = p
  }

  const pendingApprovals = (pendingApprovalsAll ?? []).map(t => ({
    id: t.id, title: t.title, priority: t.priority, score_weight: t.score_weight,
    assignee: pendingOwnerById[t.user_id] ?? null,
  }))

  const approvedYesterday = approvedYesterdayAll ?? []
  const approvedByPeer = approvedYesterday
    .filter(t => t.approved_by && approverById[t.approved_by]?.role === 'member')
    .map(t => ({ id: t.id, title: t.title, priority: t.priority, score_earned: t.score_earned ?? 0, approved_at: t.approved_at, approval_note: t.approval_note ?? null, approver: t.approved_by ? (approverById[t.approved_by] ?? null) : null }))
  const approvedByAdmin = approvedYesterday
    .filter(t => t.approved_by && approverById[t.approved_by]?.role === 'admin')
    .map(t => ({ id: t.id, title: t.title, priority: t.priority, score_earned: t.score_earned ?? 0, approved_at: t.approved_at, approval_note: t.approval_note ?? null, approver: t.approved_by ? (approverById[t.approved_by] ?? null) : null }))

  const html = memberDailyDigestEmailHtml({
    memberName: memberProfile.full_name,
    dateLabel,
    dueTodayTasks: dueTodayTasks ?? [],
    overdueTasks: overdueTasks ?? [],
    pendingApprovals,
    approvedByPeer,
    approvedByAdmin,
    appUrl,
  })

  await sendEmail(memberAuthUser.email, `[TEST] Your Daily Task Digest — ${subjectDate}`, html)
  return NextResponse.json({ success: true, sentTo: memberAuthUser.email })
}
