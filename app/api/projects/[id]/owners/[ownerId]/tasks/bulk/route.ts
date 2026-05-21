import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/api'

const rowSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(8000).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  status: z.enum(['pending', 'in_progress', 'completed']).default('pending'),
  progress: z.number().int().min(0).max(100).default(0),
  assignee_id: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
})

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; ownerId: string }> }) {
  const { id: projectId, ownerId } = await params
  const { user, error } = await getAuthUser()
  if (error || !user) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createClient()

  const { data: owner, error: ownerErr } = await supabase
    .from('project_owners')
    .select('id, department, project_id')
    .eq('id', ownerId)
    .single()

  if (ownerErr || !owner || owner.project_id !== projectId) {
    return NextResponse.json({ error: 'Invalid owner for this project' }, { status: 400 })
  }

  const inserts = parsed.data.rows.map(r => ({
    project_id: projectId,
    owner_id: owner.id,
    title: r.title,
    description: r.description ?? null,
    category: owner.department,
    priority: r.priority,
    status: r.status,
    progress: r.progress,
    assignee_id: r.assignee_id ?? null,
    due_date: r.due_date || null,
    created_by: user.id,
  }))

  const { data, error: dbError } = await supabase
    .from('project_tasks')
    .insert(inserts)
    .select('id')

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ inserted: data?.length ?? 0 }, { status: 201 })
}
