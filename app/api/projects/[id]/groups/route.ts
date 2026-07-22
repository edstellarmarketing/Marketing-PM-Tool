import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser, requireProjectContributor } from '@/lib/api'

const createSchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().max(20).nullable().optional(),
})

// Everyone authenticated can read a project's groups (RLS allows select-all).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const { user, error } = await getAuthUser()
  if (error || !user) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data, error: dbError } = await supabase
    .from('project_task_groups')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  // Project contributors (admins, managing team lead, involved members) can add
  // groups — bulk import creates any groups its rows reference.
  const { profile, error } = await requireProjectContributor(projectId)
  if (error || !profile) return error ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = createAdminClient()

  // New groups land at the end of the project's order.
  const { data: maxRow } = await supabase
    .from('project_task_groups')
    .select('sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSortOrder = (maxRow?.sort_order ?? 0) + 1

  const { data, error: dbError } = await supabase
    .from('project_task_groups')
    .insert({
      project_id: projectId,
      name: parsed.data.name.trim(),
      color: parsed.data.color ?? null,
      sort_order: nextSortOrder,
    })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
