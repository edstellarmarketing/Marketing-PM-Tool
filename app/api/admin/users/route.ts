import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api'

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const supabase = await createClient()
  const { data, error: dbError } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name')

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}
