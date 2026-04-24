import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api'
import { chatCompletion } from '@/lib/openrouter'
import { z } from 'zod'

const schema = z.object({
  goal: z.string().min(5),
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().optional(),
})

export async function POST(req: NextRequest) {
  const { error } = await getAuthUser()
  if (error) return error

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { goal, month, year } = parsed.data
  const monthCtx = month && year
    ? `for ${new Date(year, month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}`
    : 'for the current month'

  const prompt = `You are a marketing project manager. A team member wants to achieve this goal ${monthCtx}:

"${goal}"

Break this goal into 4–6 specific, actionable tasks that a marketing professional would work on.

Return a JSON array only (no markdown, no explanation) where each item has:
- "title": short task title (max 60 chars)
- "description": one sentence describing the task
- "category": one of content | social | email | ads | seo | design | other
- "priority": one of low | medium | high | critical
- "task_type": one of monthly_task | new_implementation | ai (monthly_task = recurring operational task, new_implementation = new feature/project rollout, ai = AI-driven work)
- "complexity": one of easy | medium | difficult
- "estimated_days": integer 1–7

Example format:
[{"title":"...","description":"...","category":"content","priority":"medium","task_type":"monthly_task","complexity":"medium","estimated_days":3}]`

  try {
    const raw = await chatCompletion([{ role: 'user', content: prompt }])
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const suggestions = JSON.parse(cleaned)
    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ error: 'AI generation failed. Please try again.' }, { status: 500 })
  }
}
