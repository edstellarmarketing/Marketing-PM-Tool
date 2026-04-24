import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api'
import { createClient } from '@/lib/supabase/server'
import { chatCompletion } from '@/lib/openrouter'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export async function POST() {
  const { user, error } = await getAuthUser()
  if (error) return error

  const supabase = await createClient()
  const now = new Date()
  const currMonth = now.getMonth() + 1
  const currYear  = now.getFullYear()
  const prevMonth = currMonth === 1 ? 12 : currMonth - 1
  const prevYear  = currMonth === 1 ? currYear - 1 : currYear

  const [{ data: allScores }, { data: awards }, { data: tasks }] = await Promise.all([
    supabase.from('monthly_scores').select('*').eq('user_id', user!.id).order('year').order('month'),
    supabase.from('user_awards').select('*, award_types(name, icon)').eq('user_id', user!.id).order('created_at', { ascending: false }),
    supabase.from('tasks').select('status, task_type, due_date, completion_date').eq('user_id', user!.id).neq('is_draft', true),
  ])

  const scores  = allScores ?? []
  const curr    = scores.find(s => s.month === currMonth && s.year === currYear)
  const prev    = scores.find(s => s.month === prevMonth && s.year === prevYear)
  const last6   = scores.slice(-6)

  const overdueTasks = (tasks ?? []).filter(t =>
    t.due_date && t.status !== 'done' && new Date(t.due_date) < now
  )

  const typeBreakdown: Record<string, number> = {}
  for (const t of tasks ?? []) {
    if (t.task_type) typeBreakdown[t.task_type] = (typeBreakdown[t.task_type] ?? 0) + 1
  }

  const prompt = `You are a personal performance coach for a marketing professional. Analyse their data and return personalised insights.

Current month (${MONTHS[currMonth - 1]} ${currYear}):
${curr
    ? `Score: ${curr.score_earned}pts earned / ${curr.score_possible}pts possible | Completion: ${Number(curr.completion_rate).toFixed(0)}% | Tasks: ${curr.completed_tasks}/${curr.total_tasks} | Rank: #${curr.rank ?? 'N/A'} | Bonus: ${curr.bonus_points ?? 0}pts`
    : 'No score data recorded yet this month'}

Previous month (${MONTHS[prevMonth - 1]} ${prevYear}):
${prev
    ? `Score: ${prev.score_earned}pts earned / ${prev.score_possible}pts possible | Completion: ${Number(prev.completion_rate).toFixed(0)}% | Tasks: ${prev.completed_tasks}/${prev.total_tasks} | Rank: #${prev.rank ?? 'N/A'}`
    : 'No data available'}

Last 6 months trend (oldest to newest):
${last6.length > 0
    ? last6.map(s => `${MONTHS[s.month - 1]} ${s.year}: ${s.score_earned}pts, ${Number(s.completion_rate).toFixed(0)}% completion, rank #${s.rank ?? '?'}`).join('\n')
    : 'No history yet'}

Awards earned total: ${(awards ?? []).length}
Recent awards: ${(awards ?? []).slice(0, 3).map((a: { award_types?: { name: string } }) => a.award_types?.name).filter(Boolean).join(', ') || 'None'}
Current overdue tasks: ${overdueTasks.length}
Task type breakdown: ${JSON.stringify(typeBreakdown)}

Return a JSON object only (no markdown) with exactly these keys:
- "month_comparison": 2-3 sentences comparing current month to previous month using real numbers from the data
- "trend": 2 sentences on the 6-month progression pattern
- "strengths": array of exactly 2 specific strengths observed from the data
- "focus_areas": array of exactly 2 specific areas needing improvement
- "recommendations": array of exactly 3 short actionable steps (max 15 words each)
- "momentum": exactly one of "rising" | "stable" | "declining" based on the last 3 months`

  try {
    const raw     = await chatCompletion([{ role: 'user', content: prompt }])
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const insights = JSON.parse(cleaned)
    return NextResponse.json({ insights, generated_at: new Date().toISOString() })
  } catch {
    return NextResponse.json({ error: 'AI generation failed. Please try again.' }, { status: 500 })
  }
}
