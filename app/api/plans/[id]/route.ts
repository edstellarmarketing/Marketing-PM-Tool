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

const updatePlanSchema = z.object({
  goals: z.array(goalSchema).optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await getAuthUser()
  if (error) return error

  const body = await req.json()
  const parsed = updatePlanSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createClient()
  const { data, error: dbError } = await supabase
    .from('monthly_plans')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await getAuthUser()
  if (error) return error

  const supabase = await createClient()
  const { error: dbError } = await supabase.from('monthly_plans').delete().eq('id', id)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
