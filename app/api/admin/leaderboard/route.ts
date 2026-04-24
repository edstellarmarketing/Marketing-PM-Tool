import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/api'

export async function GET(req: NextRequest) {
  const { error } = await getAuthUser()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1))
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()))

  const supabase = await createClient()
  const { data, error: rpcError } = await supabase.rpc('get_leaderboard', {
    p_month: month,
    p_year: year,
  })

  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 })
  return NextResponse.json(data)
}
