import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminOrTeamLead, canManageProject } from '@/lib/api'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; ownerId: string }> }) {
  const { id: projectId, ownerId } = await params
  const { profile, error } = await requireAdminOrTeamLead()
  if (error || !profile) return error ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await canManageProject(profile, projectId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const { error: dbError } = await supabase.from('project_owners').delete().eq('id', ownerId)
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
