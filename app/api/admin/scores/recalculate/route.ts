import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api'
import { z } from 'zod'

const schema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020),
})

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createClient()
  const { error: rpcError } = await supabase.rpc('calculate_monthly_scores', {
    p_month: parsed.data.month,
    p_year: parsed.data.year,
  })

  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
