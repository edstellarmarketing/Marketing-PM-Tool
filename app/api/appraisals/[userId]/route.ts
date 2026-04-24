import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser, requireAdmin } from '@/lib/api'
import { chatCompletion } from '@/lib/openrouter'
import { z } from 'zod'

const generateSchema = z.object({
  financial_year: z.string().regex(/^\d{4}-\d{2}$/),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const { user, error } = await getAuthUser()
  if (error) return error

  // Members can only view their own appraisal
  if (user!.id !== userId) {
    const { error: adminError } = await requireAdmin()
    if (adminError) return adminError
  }

  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const fy = searchParams.get('financial_year')

  let query = supabase.from('appraisal_snapshots').select('*').eq('user_id', userId).order('financial_year', { ascending: false })
  if (fy) query = query.eq('financial_year', fy)

  const { data, error: dbError } = await query
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params
  const { error } = await requireAdmin()
  if (error) return error

  const body = await req.json()
  const parsed = generateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { financial_year } = parsed.data

  // Parse FY range: "2024-25" → Apr 2024 – Mar 2025
  const [fyStartStr, fyEndShort] = financial_year.split('-')
  const fyStartYear = parseInt(fyStartStr)
  const fyEndYear = 2000 + parseInt(fyEndShort)

  const fyStart = `${fyStartYear}-04-01`
  const fyEnd   = `${fyEndYear}-03-31`

  // Get annual stats, FY awards, and attendance in parallel
  const [
    { data: monthlyStats, error: statsError },
    { data: categoryStats, error: catError },
    { data: fyAwardsRaw },
    { data: attendanceLeaves },
  ] = await Promise.all([
    supabase.rpc('get_annual_stats', { p_user_id: userId, p_financial_year: financial_year }),
    supabase.rpc('get_annual_category_stats', { p_user_id: userId, p_financial_year: financial_year }),
    adminClient
      .from('user_awards')
      .select('id, bonus_points, month, year, note, award_types(name, icon)')
      .eq('user_id', userId)
      .or(
        `and(year.eq.${fyStartYear},month.gte.4),and(year.eq.${fyEndYear},month.lte.3)`
      ),
    adminClient
      .from('attendance_leaves')
      .select('date, leave_type')
      .eq('user_id', userId)
      .gte('date', fyStart)
      .lte('date', fyEnd),
  ])

  if (statsError) return NextResponse.json({ error: statsError.message }, { status: 500 })
  if (catError) return NextResponse.json({ error: catError.message }, { status: 500 })

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userId).single()

  const fyAwards = fyAwardsRaw ?? []
  const fyBonusTotal = fyAwards.reduce((sum: number, a: { bonus_points: number }) => sum + a.bonus_points, 0)

  const taskScore = monthlyStats?.reduce((s: number, m: { score_earned: number }) => s + m.score_earned, 0) ?? 0
  const totalScore = taskScore + fyBonusTotal
  const avgScore = monthlyStats?.length ? taskScore / monthlyStats.length : 0
  const peakMonth = monthlyStats?.reduce((best: { score_earned: number; month: number; year: number } | null, m: { score_earned: number; month: number; year: number }) =>
    !best || m.score_earned > best.score_earned ? m : best, null)

  const awardsText = fyAwards.length > 0
    ? `\nAwards & Recognition (${fyAwards.length} awards, total bonus: ${fyBonusTotal} pts):\n` +
      (fyAwards as unknown as Array<{ award_types?: { name: string; icon: string } | null; bonus_points: number; month: number; year: number; note?: string | null }>)
        .map(a => `  - ${a.award_types?.icon ?? '🏅'} ${a.award_types?.name ?? 'Award'}: +${a.bonus_points} pts (${a.month}/${a.year})${a.note ? ` — "${a.note}"` : ''}`)
        .join('\n')
    : '\nAwards & Recognition: None this FY'

  // Attendance summary
  const leaves = (attendanceLeaves ?? []) as Array<{ date: string; leave_type: string }>
  const sickLeaves   = leaves.filter(l => l.leave_type === 'sick').length
  const casualLeaves = leaves.filter(l => l.leave_type === 'casual').length
  // Count months in FY with at least one leave
  const monthsWithLeaves = new Set(leaves.map(l => l.date.slice(0, 7))).size
  const totalFYMonths = 12
  const perfectMonths = totalFYMonths - monthsWithLeaves
  const attendanceBonusTotal = (fyAwards as unknown as Array<{ award_types?: { name: string } | null; bonus_points: number }>)
    .filter(a => a.award_types?.name === 'Perfect Attendance')
    .reduce((s, a) => s + a.bonus_points, 0)

  const attendanceText = `
Attendance for financial year ${financial_year}:
Total leaves: ${leaves.length} (${sickLeaves} sick, ${casualLeaves} casual)
Perfect attendance months: ${perfectMonths} of ${totalFYMonths}
Months with leaves: ${monthsWithLeaves}
Attendance bonus points earned: ${attendanceBonusTotal}`

  // Generate AI summary
  const prompt = `You are an HR analyst. Generate a professional annual appraisal summary for ${profile?.full_name ?? 'this team member'} for financial year ${financial_year}.

Monthly performance data:
${JSON.stringify(monthlyStats, null, 2)}

Category performance data:
${JSON.stringify(categoryStats, null, 2)}
${awardsText}
${attendanceText}

Task score: ${taskScore}
Award bonus: ${fyBonusTotal}
Total annual score: ${totalScore}
Average monthly task score: ${avgScore.toFixed(1)}
Peak month: ${peakMonth ? `Month ${peakMonth.month}/${peakMonth.year} (score: ${peakMonth.score_earned})` : 'N/A'}

Return a JSON object with:
- "summary": 3-4 sentence narrative about their overall performance, mentioning any awards received if applicable
- "strengths": array of 3 specific strengths based on the data
- "areas_of_improvement": array of 2-3 specific improvement areas
- "recommended_rating": one of "Exceptional", "Exceeds Expectations", "Meets Expectations", "Needs Improvement", "Underperforming"
- "development_roadmap": array of 3-4 actionable steps for growth in the next FY based on their category performance and weaknesses
- "attendance_insight": 2-sentence insight about this user's attendance reliability, consistency, and how it compares to a good standard. Be specific about which months had leaves if relevant.

Return only valid JSON, no markdown.`

  let aiResult = { summary: '', strengths: [], areas_of_improvement: [], recommended_rating: '', development_roadmap: [], attendance_insight: '' }
  try {
    const aiResponse = await chatCompletion([{ role: 'user', content: prompt }])
    const cleanJson = aiResponse.replace(/```json\n?|```/g, '').trim()
    aiResult = JSON.parse(cleanJson)
  } catch (err) {
    console.error('AI Parse Error:', err)
  }

  const { data: snapshot, error: insertError } = await supabase
    .from('appraisal_snapshots')
    .upsert({
      user_id: userId,
      financial_year,
      total_score: totalScore,
      award_bonus: fyBonusTotal,
      avg_monthly_score: avgScore,
      peak_month: peakMonth ? `${peakMonth.month}/${peakMonth.year}` : null,
      ai_summary: aiResult.summary,
      ai_strengths: aiResult.strengths,
      ai_areas_of_improvement: aiResult.areas_of_improvement,
      ai_development_roadmap: aiResult.development_roadmap,
      ai_attendance_insight: aiResult.attendance_insight || null,
    }, { onConflict: 'user_id,financial_year' })
    .select()
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  return NextResponse.json(snapshot, { status: 201 })
}
