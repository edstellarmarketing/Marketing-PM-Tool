import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/api'

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const adminClient = createAdminClient()
  const { data, error: dbError } = await adminClient
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'member')
    .eq('is_active', true)
    .order('full_name')

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}
