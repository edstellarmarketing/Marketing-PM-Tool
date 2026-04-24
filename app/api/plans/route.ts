import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/api'
import { z } from 'zod'

const checklistItemSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  status: z.enum(['todo', 'in_progress', 'done']).default('todo'),
})

const goalSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  target_metric: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  score_weight: z.number().int().min(1).default(10),
  progress: z.number().min(0).max(100).default(0),
  type: z.enum(['one_time', 'checklist']).default('one_time'),
  checklist: z.array(checklistItemSchema).optional(),
  approval_status: z.enum(['draft', 'pending_approval', 'approved', 'rejected']).optional(),
  approval_note: z.string().nullable().optional(),
})

const createPlanSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020),
  goals: z.array(goalSchema).default([]),
})

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error) return error

  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const year = searchParams.get('year')

  let query = supabase.from('monthly_plans').select('*').eq('user_id', user!.id).order('year', { ascending: false }).order('month', { ascending: false })

  if (month) query = query.eq('month', parseInt(month))
  if (year) query = query.eq('year', parseInt(year))

  const { data, error: dbError } = await query
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error) return error

  const body = await req.json()
  const parsed = createPlanSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createClient()
  const { data, error: dbError } = await supabase
    .from('monthly_plans')
    .insert({ ...parsed.data, user_id: user!.id })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
