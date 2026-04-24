import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/api'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id } = await params
  const admin = createAdminClient()

  const [{ data: tasks }, { data: scores }, { data: awards }] = await Promise.all([
    admin.from('tasks').select('id, title, status, approval_status, score_earned, score_weight, due_date, created_at, is_draft').eq('user_id', id).order('created_at', { ascending: false }),
    admin.from('monthly_scores').select('*').eq('user_id', id).order('year', { ascending: false }).order('month', { ascending: false }),
    admin.from('user_awards').select('id, bonus_points, month, year, task_id, created_at, award_types(name, icon)').eq('user_id', id).order('created_at', { ascending: false }),
  ])

  return NextResponse.json({ tasks: tasks ?? [], scores: scores ?? [], awards: awards ?? [] })
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin()
  if (error) return error

  const { id } = await params
  const admin = createAdminClient()

  // Verify the user exists
  const { data: profile } = await admin.from('profiles').select('id, full_name').eq('id', id).single()
  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Fetch all tasks and awards for this user
  const [{ data: tasks }, { data: awards }] = await Promise.all([
    admin.from('tasks').select('score_earned, score_weight, status, approval_status, due_date, created_at, is_draft').eq('user_id', id),
    admin.from('user_awards').select('bonus_points, month, year').eq('user_id', id),
  ])

  // Build per-month aggregates for tasks
  type MonthKey = string
  type MonthAgg = { total: number; completed: number; score_earned: number; score_possible: number }
  const taskAgg = new Map<MonthKey, MonthAgg>()

  for (const t of (tasks ?? []) as { score_earned: number; score_weight: number; status: string; approval_status: string; due_date: string | null; created_at: string; is_draft: boolean }[]) {
    if (t.is_draft) continue
    const d = t.due_date ? new Date(t.due_date) : new Date(t.created_at)
    const m = d.getMonth() + 1
    const y = d.getFullYear()
    const key = `${y}-${m}`
    if (!taskAgg.has(key)) taskAgg.set(key, { total: 0, completed: 0, score_earned: 0, score_possible: 0 })
    const agg = taskAgg.get(key)!
    agg.total++
    agg.score_possible += t.score_weight ?? 0
    if (t.status === 'done') {
      agg.completed++
      if (t.approval_status === 'approved') agg.score_earned += t.score_earned ?? 0
    }
  }

  // Build per-month bonus_points from actual awards
  const awardAgg = new Map<MonthKey, number>()
  for (const a of (awards ?? []) as { bonus_points: number; month: number; year: number }[]) {
    const key = `${a.year}-${a.month}`
    awardAgg.set(key, (awardAgg.get(key) ?? 0) + a.bonus_points)
  }

  // Collect all months that need updating (union of task months + award months + existing score months)
  const { data: existingScores } = await admin.from('monthly_scores').select('month, year').eq('user_id', id)
  const allMonths = new Set<MonthKey>([
    ...Array.from(taskAgg.keys()),
    ...Array.from(awardAgg.keys()),
    ...((existingScores ?? []) as { month: number; year: number }[]).map(s => `${s.year}-${s.month}`),
  ])

  // Upsert each month
  for (const key of allMonths) {
    const [yearStr, monthStr] = key.split('-')
    const y = parseInt(yearStr)
    const m = parseInt(monthStr)
    const agg = taskAgg.get(key) ?? { total: 0, completed: 0, score_earned: 0, score_possible: 0 }
    const bonus = awardAgg.get(key) ?? 0
    const rate = agg.total > 0 ? Math.round((agg.completed / agg.total) * 100 * 100) / 100 : 0

    await admin.from('monthly_scores').upsert({
      user_id:          id,
      month:            m,
      year:             y,
      total_tasks:      agg.total,
      completed_tasks:  agg.completed,
      score_earned:     Math.round(agg.score_earned * 100) / 100,
      score_possible:   Math.round(agg.score_possible * 100) / 100,
      completion_rate:  rate,
      bonus_points:     bonus,
    }, { onConflict: 'user_id,month,year' })
  }

  // Re-rank all affected months
  const affectedMonths = new Set(
    Array.from(allMonths).map(key => { const [y, m] = key.split('-'); return `${y}-${m}` })
  )
  for (const key of affectedMonths) {
    const [yearStr, monthStr] = key.split('-')
    const y = parseInt(yearStr)
    const m = parseInt(monthStr)
    const { data: monthScores } = await admin
      .from('monthly_scores')
      .select('id, score_earned, bonus_points, completion_rate')
      .eq('month', m)
      .eq('year', y)
      .order('score_earned', { ascending: false })

    if (!monthScores) continue
    const sorted = [...(monthScores as { id: string; score_earned: number; bonus_points: number; completion_rate: number }[])]
      .sort((a, b) => (b.score_earned + b.bonus_points) - (a.score_earned + a.bonus_points) || b.completion_rate - a.completion_rate)

    for (let i = 0; i < sorted.length; i++) {
      await admin.from('monthly_scores').update({ rank: i + 1 }).eq('id', sorted[i].id)
    }
  }

  return NextResponse.json({ success: true, months_updated: allMonths.size })
}
