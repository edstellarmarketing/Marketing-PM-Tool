import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const admin = createAdminClient()
  const { data, error: dbError } = await admin
    .from('task_date_change_requests')
    .select('*, tasks(id, title, user_id, start_date, due_date), requester:profiles!task_date_change_requests_requested_by_fkey(full_name, avatar_url)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
