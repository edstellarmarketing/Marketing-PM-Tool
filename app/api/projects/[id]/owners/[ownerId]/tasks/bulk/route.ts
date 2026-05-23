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
  start_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  dependency_task: z.string().max(200).nullable().optional(),
  dependency_details: z.string().max(2000).nullable().optional(),
  dependency_status: z.string().max(60).nullable().optional(),
  dependency_owner_id: z.string().uuid().nullable().optional(),
  dependency_owner_ids: z.array(z.string().uuid()).max(50).nullable().optional(),
  final_comments: z.string().max(4000).nullable().optional(),
  sort_order: z.number().int().min(0).max(1_000_000).nullable().optional(),
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

  // Bulk uploads append after the project's existing tasks: assign each incoming row a
  // monotonically increasing sort_order starting at MAX(existing) + 1, preserving the
  // order the client sent (which is already sorted by the S.No column in the file).
  const { data: maxRow } = await supabase
    .from('project_tasks')
    .select('sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  const baseSortOrder = maxRow?.sort_order ?? 0

  const inserts = parsed.data.rows.map((r, i) => ({
    project_id: projectId,
    owner_id: owner.id,
    title: r.title,
    description: r.description ?? null,
    category: owner.department,
    priority: r.priority,
    status: r.status,
    progress: r.progress,
    start_date: r.start_date || null,
    due_date: r.due_date || null,
    dependency_task: r.dependency_task ?? null,
    dependency_details: r.dependency_details ?? null,
    dependency_status: r.dependency_status ?? null,
    dependency_owner_id: r.dependency_owner_ids?.[0] ?? r.dependency_owner_id ?? null,
    dependency_owner_ids: r.dependency_owner_ids?.length ? r.dependency_owner_ids : null,
    final_comments: r.final_comments ?? null,
    sort_order: baseSortOrder + i + 1,
    created_by: user.id,
  }))

  const { data, error: dbError } = await supabase
    .from('project_tasks')
    .insert(inserts)
    .select('id')

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ inserted: data?.length ?? 0 }, { status: 201 })
}
