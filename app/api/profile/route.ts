import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const schema = z.object({
  full_name: z.string().min(1).optional(),
  designation: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  joining_date: z.string().optional().nullable(),
  avatar_url: z.string().optional().nullable(),
})

export async function GET() {
  const { user, error } = await getAuthUser()
  if (error || !user) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data, error: dbError } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error || !user) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createClient()
  const { error: updateError } = await supabase
    .from('profiles')
    .update(parsed.data)
    .eq('id', user.id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
