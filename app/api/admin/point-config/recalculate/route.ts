import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api'

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const supabase = await createClient()

  // Touch all open classified tasks so the DB trigger recalculates score_weight
  const { data, error: dbError } = await supabase
    .from('tasks')
    .update({ updated_at: new Date().toISOString() })
    .neq('status', 'done')
    .not('task_type', 'is', null)
    .not('complexity', 'is', null)
    .select('id')

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ updated: data?.length ?? 0 })
}
