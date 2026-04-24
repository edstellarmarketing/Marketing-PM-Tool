import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const admin = createAdminClient()
  const { data, error: dbError } = await admin
    .from('tasks')
    .select('*, profiles!tasks_user_id_fkey(full_name, avatar_url)')
    .eq('approval_status', 'pending_approval')
    .eq('status', 'done')
    .order('updated_at', { ascending: false })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
