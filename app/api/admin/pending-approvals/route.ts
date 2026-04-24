import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error) return error

  const admin = createAdminClient()
  const view = new URL(req.url).searchParams.get('view') ?? 'pending'
  const isHistory = view === 'history'

  const { data: profile } = await admin.from('profiles').select('role').eq('id', user!.id).single()
  const isAdmin = profile?.role === 'admin'

  type TaskRow = {
    id: string; title: string; status: string; approval_status: string; priority: string
    task_type: string | null; complexity: string | null
    score_weight: number; score_earned: number; due_date: string | null
    updated_at: string; approved_at: string | null; approval_note: string | null
    user_id: string; parent_task_id: string | null
    subtasks: { id: string; title: string; completed: boolean }[] | null
    user: { full_name: string; avatar_url: string | null } | null
    approver: { id: string; full_name: string; avatar_url: string | null } | null
  }

  type DateReqRow = {
    id: string; task_id: string; status: string
    current_start_date: string | null; current_due_date: string | null
    requested_start_date: string | null; requested_due_date: string | null
    reason: string | null; created_at: string
    reviewed_at: string | null; review_note: string | null
    tasks: { id: string; title: string; user_id: string; parent_task_id: string | null } | null
    requester: { id: string; full_name: string; avatar_url: string | null } | null
    reviewer: { id: string; full_name: string; avatar_url: string | null } | null
  }

  // For non-admin: pre-compute task IDs they are allowed to review.
  // Includes: dependency tasks whose parent is owned by this user, AND tasks directly assigned by this user.
  let memberDepTaskIds: string[] = []
  if (!isAdmin) {
    // 1. Dependency tasks where the parent task belongs to this user
    const { data: myMainTasks } = await admin
      .from('tasks')
      .select('id')
      .eq('user_id', user!.id)
      .is('parent_task_id', null)
    const myMainIds = (myMainTasks ?? []).map(t => t.id)
    if (myMainIds.length > 0) {
      const { data: depTasks } = await admin
        .from('tasks')
        .select('id')
        .in('parent_task_id', myMainIds)
      memberDepTaskIds = (depTasks ?? []).map(t => t.id)
    }

    // 2. Tasks directly assigned by this user to someone else
    const { data: assignedTasks } = await admin
      .from('tasks')
      .select('id')
      .eq('assigned_by', user!.id)
      .neq('user_id', user!.id)
    memberDepTaskIds = [...new Set([...memberDepTaskIds, ...(assignedTasks ?? []).map(t => t.id)])]
  }

  const baseTaskSelect = 'id, title, status, approval_status, priority, task_type, complexity, score_weight, score_earned, due_date, updated_at, user_id, parent_task_id, subtasks, user:profiles!tasks_user_id_fkey(full_name, avatar_url)'
  const historyTaskSelect = baseTaskSelect + ', approved_at, approval_note, approver:profiles!tasks_approved_by_fkey(id, full_name, avatar_url)'
  const baseDateSelect = 'id, task_id, current_start_date, current_due_date, requested_start_date, requested_due_date, reason, created_at, tasks(id, title, user_id, parent_task_id), requester:profiles!task_date_change_requests_requested_by_fkey(id, full_name, avatar_url)'
  const historyDateSelect = baseDateSelect + ', status, reviewed_at, review_note, reviewer:profiles!task_date_change_requests_reviewed_by_fkey(id, full_name, avatar_url)'

  const empty = NextResponse.json({ items: [], counts: { total: 0, task_completion: 0, date_change: 0 } })

  if (isHistory) {
    let tasksQuery = admin
      .from('tasks')
      .select(historyTaskSelect)
      .eq('status', 'done')
      .eq('approval_status', 'approved')
      .order('approved_at', { ascending: false })
      .limit(200)
    let dateReqsQuery = admin
      .from('task_date_change_requests')
      .select(historyDateSelect)
      .in('status', ['approved', 'rejected'])
      .order('reviewed_at', { ascending: false })
      .limit(200)

    if (isAdmin) {
      // Admin history: main tasks only, excluding tasks assigned by another user
      tasksQuery = tasksQuery
        .is('parent_task_id', null)
        .or(`assigned_by.is.null,assigned_by.eq.${user!.id}`)
    } else {
      // Member: only tasks they reviewed (as assigner or parent-task owner)
      if (memberDepTaskIds.length === 0) return empty
      tasksQuery = tasksQuery.in('id', memberDepTaskIds).eq('approved_by', user!.id)
      dateReqsQuery = dateReqsQuery.in('task_id', memberDepTaskIds).eq('reviewed_by', user!.id)
    }

    const [{ data: tasks, error: tErr }, { data: dateReqs, error: dErr }] = await Promise.all([
      tasksQuery,
      dateReqsQuery,
    ])

    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 })

    let taskRows = (tasks ?? []) as unknown as TaskRow[]
    let dateRows = (dateReqs ?? []) as unknown as DateReqRow[]

    // Admin: also strip date change requests for dependency tasks (those belong to parent owners)
    if (isAdmin) {
      dateRows = dateRows.filter(r => !r.tasks?.parent_task_id)
    }

    const items = [
      ...taskRows.map(t => ({
        id: t.id,
        type: 'task_completion' as const,
        title: t.title,
        status: t.approval_status,
        isDependency: !!t.parent_task_id,
        requestedBy: { id: t.user_id, fullName: t.user?.full_name ?? 'Unknown', avatarUrl: t.user?.avatar_url ?? null },
        reviewedBy: t.approver ? { id: t.approver.id, fullName: t.approver.full_name, avatarUrl: t.approver.avatar_url } : null,
        requestedAt: t.updated_at,
        reviewedAt: t.approved_at,
        note: t.approval_note,
        details: {
          status: t.status, priority: t.priority,
          task_type: t.task_type, complexity: t.complexity,
          score_weight: t.score_weight, score_earned: t.score_earned,
          due_date: t.due_date,
          subtasks_total: (t.subtasks ?? []).length,
          subtasks_completed: (t.subtasks ?? []).filter(s => s.completed).length,
        },
      })),
      ...dateRows.map(r => ({
        id: r.id,
        type: 'date_change' as const,
        title: r.tasks?.title ?? 'Task',
        status: r.status,
        isDependency: !!r.tasks?.parent_task_id,
        requestedBy: { id: r.requester?.id, fullName: r.requester?.full_name ?? 'Unknown', avatarUrl: r.requester?.avatar_url ?? null },
        reviewedBy: r.reviewer ? { id: r.reviewer.id, fullName: r.reviewer.full_name, avatarUrl: r.reviewer.avatar_url } : null,
        requestedAt: r.created_at,
        reviewedAt: r.reviewed_at,
        note: r.review_note,
        details: {
          task_id: r.task_id,
          current_start_date: r.current_start_date, current_due_date: r.current_due_date,
          requested_start_date: r.requested_start_date, requested_due_date: r.requested_due_date,
          reason: r.reason,
        },
      })),
    ].sort((a, b) => new Date(b.reviewedAt ?? b.requestedAt).getTime() - new Date(a.reviewedAt ?? a.requestedAt).getTime())

    return NextResponse.json({
      items,
      counts: { total: items.length, task_completion: taskRows.length, date_change: dateRows.length },
    })
  }

  // ── Pending view ─────────────────────────────────────────────────────────
  let tasksQuery = admin
    .from('tasks')
    .select(baseTaskSelect)
    .eq('approval_status', 'pending_approval')
    .eq('status', 'done')
    .order('updated_at', { ascending: false })
  let dateReqsQuery = admin
    .from('task_date_change_requests')
    .select(baseDateSelect)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (isAdmin) {
    // Admin pending: main tasks only, excluding tasks assigned by another user
    tasksQuery = tasksQuery
      .is('parent_task_id', null)
      .or(`assigned_by.is.null,assigned_by.eq.${user!.id}`)
  } else {
    if (memberDepTaskIds.length === 0) return empty
    tasksQuery = tasksQuery.in('id', memberDepTaskIds)
    dateReqsQuery = dateReqsQuery.in('task_id', memberDepTaskIds)
  }

  const [{ data: tasks, error: tasksErr }, { data: dateReqs, error: dateErr }] = await Promise.all([
    tasksQuery,
    dateReqsQuery,
  ])

  if (tasksErr) return NextResponse.json({ error: tasksErr.message }, { status: 500 })
  if (dateErr) return NextResponse.json({ error: dateErr.message }, { status: 500 })

  let taskRows = (tasks ?? []) as unknown as TaskRow[]
  let dateRows = (dateReqs ?? []) as unknown as DateReqRow[]

  // Admin: strip date change requests for dependency tasks (those belong to parent owners)
  if (isAdmin) {
    dateRows = dateRows.filter(r => !r.tasks?.parent_task_id)
  }

  const items = [
    ...taskRows.map(t => ({
      id: t.id,
      type: 'task_completion' as const,
      title: t.title,
      status: 'pending_approval',
      isDependency: !!t.parent_task_id,
      requestedBy: { id: t.user_id, fullName: t.user?.full_name ?? 'Unknown', avatarUrl: t.user?.avatar_url ?? null },
      reviewedBy: null as null,
      requestedAt: t.updated_at,
      reviewedAt: null as null,
      note: null as null,
      details: {
        status: t.status, priority: t.priority,
        task_type: t.task_type, complexity: t.complexity,
        score_weight: t.score_weight, score_earned: t.score_earned,
        due_date: t.due_date,
      },
    })),
    ...dateRows.map(r => ({
      id: r.id,
      type: 'date_change' as const,
      title: r.tasks?.title ?? 'Task',
      status: 'pending',
      isDependency: !!r.tasks?.parent_task_id,
      requestedBy: { id: r.requester?.id, fullName: r.requester?.full_name ?? 'Unknown', avatarUrl: r.requester?.avatar_url ?? null },
      reviewedBy: null as null,
      requestedAt: r.created_at,
      reviewedAt: null as null,
      note: null as null,
      details: {
        task_id: r.task_id,
        current_start_date: r.current_start_date, current_due_date: r.current_due_date,
        requested_start_date: r.requested_start_date, requested_due_date: r.requested_due_date,
        reason: r.reason,
      },
    })),
  ].sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())

  return NextResponse.json({
    items,
    counts: { total: items.length, task_completion: taskRows.length, date_change: dateRows.length },
  })
}
