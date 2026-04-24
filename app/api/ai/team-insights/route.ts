import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api'
import { createClient } from '@/lib/supabase/server'
import { chatCompletion } from '@/lib/openrouter'

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const supabase = await createClient()
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const [{ data: scores }, { data: blockedTasks }, { data: profiles }] = await Promise.all([
    supabase.from('monthly_scores').select('*, profiles(full_name, department)').eq('month', month).eq('year', year),
    supabase.from('tasks').select('title, user_id, profiles(full_name)').eq('status', 'blocked'),
    supabase.from('profiles').select('id, full_name, department'),
  ])

  const memberData = (scores ?? []).map((s: Record<string, unknown>) => ({
    name: (s.profiles as { full_name: string } | null)?.full_name ?? 'Unknown',
    score_earned: s.score_earned,
    completion_rate: s.completion_rate,
    total_tasks: s.total_tasks,
    completed_tasks: s.completed_tasks,
    rank: s.rank,
  }))

  const prompt = `You are an HR/marketing analytics expert. Analyze this team's performance data for ${new Date(year, month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })} and provide weekly insights.

Team scores:
${JSON.stringify(memberData, null, 2)}

Blocked tasks: ${(blockedTasks ?? []).length}
Total members: ${(profiles ?? []).length}

Return a JSON object only (no markdown) with:
- "summary": 2-3 sentence team performance overview
- "at_risk": array of member names who need attention (completion rate < 50%)
- "overloaded": array of member names with too many tasks relative to completion
- "top_performers": array of top 2-3 performer names
- "recommendations": array of 3 actionable recommendations for the team
- "team_health": one of "excellent" | "good" | "needs_attention" | "critical"`

  try {
    const raw = await chatCompletion([{ role: 'user', content: prompt }])
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const insights = JSON.parse(cleaned)
    return NextResponse.json({ insights, generated_at: new Date().toISOString() })
  } catch {
    return NextResponse.json({ error: 'AI generation failed. Please try again.' }, { status: 500 })
  }
}
