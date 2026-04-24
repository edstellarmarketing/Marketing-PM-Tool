import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/api'

export async function GET() {
  const { error } = await getAuthUser()
  if (error) return error

  const supabase = await createClient()
  const { data, error: dbError } = await supabase
    .from('point_config')
    .select('*')
    .order('category')
    .order('config_key')

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}
