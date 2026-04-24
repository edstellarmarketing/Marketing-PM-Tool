import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api'
import { chatCompletion } from '@/lib/openrouter'
import { z } from 'zod'

const schema = z.object({
  objectives: z.string().min(10),
  month: z.number().int().min(1).max(12),
  year: z.number().int(),
  department: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const { error } = await getAuthUser()
  if (error) return error

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { objectives, month, year, department } = parsed.data
  const monthName = new Date(year, month - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })

  const prompt = `You are a senior marketing strategist. Create a structured monthly plan for a ${department ?? 'marketing'} professional for ${monthName}.

Their objectives:
"${objectives}"

Generate 4–6 goals that will help achieve these objectives.

Return a JSON array only (no markdown) where each goal has:
- "title": clear goal title (max 80 chars)
- "target_metric": measurable outcome (e.g. "Publish 4 blog posts", "Grow followers by 500")
- "category": one of content | social | email | ads | seo | design | other
- "score_weight": integer 10–30 based on importance

Example:
[{"title":"...","target_metric":"...","category":"content","score_weight":20}]`

  try {
    const raw = await chatCompletion([{ role: 'user', content: prompt }])
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const goals = JSON.parse(cleaned)
    return NextResponse.json({ goals })
  } catch {
    return NextResponse.json({ error: 'AI generation failed. Please try again.' }, { status: 500 })
  }
}
