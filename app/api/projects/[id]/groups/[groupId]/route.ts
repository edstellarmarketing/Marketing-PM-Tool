import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminOrTeamLead, canManageProject } from '@/lib/api'

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  color: z.string().max(20).nullable().optional(),
  sort_order: z.number().int().min(0).max(1_000_000).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; groupId: string }> },
) {
  const { id: projectId, groupId } = await params
  const { profile, error } = await requireAdminOrTeamLead()
  if (error || !profile) return error ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await canManageProject(profile, projectId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const payload: Record<string, unknown> = { ...parsed.data }
  if (typeof payload.name === 'string') payload.name = (payload.name as string).trim()

  const supabase = createAdminClient()
  const { data, error: dbError } = await supabase
    .from('project_task_groups')
    .update(payload)
    .eq('id', groupId)
    .eq('project_id', projectId)
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

// Deleting a group leaves its tasks intact — group_id is ON DELETE SET NULL, so
// they fall back into the "Ungrouped" bucket in the UI.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; groupId: string }> },
) {
  const { id: projectId, groupId } = await params
  const { profile, error } = await requireAdminOrTeamLead()
  if (error || !profile) return error ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await canManageProject(profile, projectId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const { error: dbError } = await supabase
    .from('project_task_groups')
    .delete()
    .eq('id', groupId)
    .eq('project_id', projectId)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
