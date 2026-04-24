import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/api'
import { z } from 'zod'

const createSchema = z
  .object({
    requested_start_date: z.string().nullish(),
    requested_due_date: z.string().nullish(),
    reason: z.string().max(2000).optional(),
  })
  .refine(
    d => d.requested_start_date !== undefined || d.requested_due_date !== undefined,
    { message: 'At least one of requested_start_date or requested_due_date is required' },
  )

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, error } = await getAuthUser()
  if (error) return error

  const supabase = await createClient()
  const { data: task } = await supabase.from('tasks').select('user_id').eq('id', id).single()
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const isAdmin = profile?.role === 'admin'
  if (!isAdmin && task.user_id !== user!.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error: dbError } = await supabase
    .from('task_date_change_requests')
    .select('*')
    .eq('task_id', id)
    .order('created_at', { ascending: false })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, error } = await getAuthUser()
  if (error) return error

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createClient()
  const { data: task } = await supabase
    .from('tasks')
    .select('user_id, start_date, due_date')
    .eq('id', id)
    .single()
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (task.user_id !== user!.id) {
    return NextResponse.json({ error: 'Only the task owner can request a date change.' }, { status: 403 })
  }

  // Reject duplicates — only one pending request per task (enforced by a DB unique index too)
  const { data: existingPending } = await supabase
    .from('task_date_change_requests')
    .select('id')
    .eq('task_id', id)
    .eq('status', 'pending')
    .maybeSingle()
  if (existingPending) {
    return NextResponse.json(
      { error: 'A date change request is already pending for this task.' },
      { status: 409 },
    )
  }

  const requestedStart = parsed.data.requested_start_date ?? null
  const requestedDue = parsed.data.requested_due_date ?? null

  // No-op if nothing is actually changing
  if (requestedStart === (task.start_date ?? null) && requestedDue === (task.due_date ?? null)) {
    return NextResponse.json(
      { error: 'Requested dates match the current dates — nothing to change.' },
      { status: 400 },
    )
  }

  const { data, error: dbError } = await supabase
    .from('task_date_change_requests')
    .insert({
      task_id: id,
      requested_by: user!.id,
      current_start_date: task.start_date,
      current_due_date: task.due_date,
      requested_start_date: requestedStart,
      requested_due_date: requestedDue,
      reason: parsed.data.reason ?? null,
    })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
