import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/api'

export async function GET() {
  const { error } = await getAuthUser()
  if (error) return error

  const adminClient = createAdminClient()
  const { data, error: dbError } = await adminClient
    .from('profiles')
    .select('id, full_name, avatar_url, designation, role')
    .eq('is_active', true)
    .order('full_name')

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}
