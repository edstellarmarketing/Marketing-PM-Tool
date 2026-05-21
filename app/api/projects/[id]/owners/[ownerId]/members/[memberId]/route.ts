import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; ownerId: string; memberId: string }> }) {
  const { memberId } = await params
  const { profile, error } = await requireAdmin()
  if (error || !profile) return error ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = await createClient()
  const { error: dbError } = await supabase.from('project_owner_members').delete().eq('id', memberId)
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
