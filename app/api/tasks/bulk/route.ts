import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/api'

// Personal bulk task upload. Every row creates a task under the current user; no
// admin re-assignment, no dependencies — matching what /tasks/new can produce.
const subTaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  completed: z.boolean().default(false),
  due_date: z.string().nullable().optional(),
})

const rowSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(8000).nullable().optional(),
  category: z.string().max(120).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  task_type: z.string().max(60).nullable().optional(),
  complexity: z.string().max(60).nullable().optional(),
  start_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  subtasks: z.array(subTaskSchema).max(50).nullable().optional(),
  sort_order: z.number().int().min(0).max(1_000_000).nullable().optional(),
})

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
})

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error || !user) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Per-row, subtask due dates must fall within the row's start/due window.
  for (const row of parsed.data.rows) {
    if (!row.subtasks || row.subtasks.length === 0) continue
    if (!row.start_date && !row.due_date) continue
    for (const st of row.subtasks) {
      if (!st.due_date) continue
      if (row.start_date && st.due_date < row.start_date) {
        return NextResponse.json(
          { error: `Sub-task "${st.title}" on row "${row.title}" has a due date before that task's start date.` },
          { status: 400 },
        )
      }
      if (row.due_date && st.due_date > row.due_date) {
        return NextResponse.json(
          { error: `Sub-task "${st.title}" on row "${row.title}" has a due date after that task's due date.` },
          { status: 400 },
        )
      }
    }
  }

  const supabase = await createClient()

  // Bulk imports append after the user's existing tasks: assign each incoming row a
  // monotonically increasing sort_order starting at MAX(existing) + 1. The client has
  // already sorted rows by their S.No, so we just respect array order here.
  const { data: maxRow } = await supabase
    .from('tasks')
    .select('sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  const baseSortOrder = maxRow?.sort_order ?? 0

  const inserts = parsed.data.rows.map((r, i) => ({
    user_id: user.id,
    title: r.title,
    description: r.description ?? null,
    category: r.category ?? null,
    priority: r.priority,
    task_type: r.task_type ?? null,
    complexity: r.complexity ?? null,
    start_date: r.start_date || null,
    due_date: r.due_date || null,
    subtasks: r.subtasks?.length ? r.subtasks : null,
    approval_status: 'approved' as const,
    is_draft: false,
    sort_order: baseSortOrder + i + 1,
  }))

  const { data, error: dbError } = await supabase
    .from('tasks')
    .insert(inserts)
    .select('id')

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ inserted: data?.length ?? 0 }, { status: 201 })
}
