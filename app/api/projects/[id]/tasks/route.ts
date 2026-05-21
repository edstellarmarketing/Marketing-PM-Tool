import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/api'

const createSchema = z.object({
  owner_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  status: z.enum(['pending', 'in_progress', 'completed']).default('pending'),
  progress: z.number().int().min(0).max(100).default(0),
  assignee_id: z.string().uuid().nullable().optional(),
  due_date: z.string().nullable().optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const { user, error } = await getAuthUser()
  if (error || !user) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createClient()

  // Confirm the owner belongs to this project, capture department for the tab label.
  const { data: owner, error: ownerErr } = await supabase
    .from('project_owners')
    .select('id, department, project_id')
    .eq('id', parsed.data.owner_id)
    .single()

  if (ownerErr || !owner || owner.project_id !== projectId) {
    return NextResponse.json({ error: 'Invalid owner for this project' }, { status: 400 })
  }

  const { data, error: dbError } = await supabase
    .from('project_tasks')
    .insert({
      project_id: projectId,
      owner_id: owner.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      category: owner.department,
      priority: parsed.data.priority,
      status: parsed.data.status,
      progress: parsed.data.progress,
      assignee_id: parsed.data.assignee_id ?? null,
      due_date: parsed.data.due_date || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
