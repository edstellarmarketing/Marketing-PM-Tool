import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminOrTeamLead, canManageProject } from '@/lib/api'

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
  // null clears the group ("Ungrouped").
  group_id: z.string().uuid().nullable(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const { profile, error } = await requireAdminOrTeamLead()
  if (error || !profile) return error ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await canManageProject(profile, projectId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = createAdminClient()

  // A non-null group must belong to this project.
  if (parsed.data.group_id) {
    const { data: group } = await supabase
      .from('project_task_groups')
      .select('id')
      .eq('id', parsed.data.group_id)
      .eq('project_id', projectId)
      .maybeSingle()
    if (!group) return NextResponse.json({ error: 'Invalid group for this project' }, { status: 400 })
  }

  const { error: dbError } = await supabase
    .from('project_tasks')
    .update({ group_id: parsed.data.group_id })
    .eq('project_id', projectId)
    .in('id', parsed.data.ids)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ updated: parsed.data.ids.length })
}
