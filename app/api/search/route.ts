import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/api'

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  const supabase = await createClient()
  const { data } = await supabase
    .from('tasks')
    .select('id, title, status, priority, due_date')
    .eq('user_id', user!.id)
    .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
    .order('updated_at', { ascending: false })
    .limit(8)

  return NextResponse.json(data ?? [])
}
