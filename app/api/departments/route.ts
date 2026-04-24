import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { error: authError } = await getAuthUser()
  if (authError) return authError

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
