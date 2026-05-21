import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/api'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; ownerId: string }> }) {
  const { ownerId } = await params
  const { user, error } = await getAuthUser()
  if (error || !user) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { error: dbError } = await supabase.from('project_owners').delete().eq('id', ownerId)
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
