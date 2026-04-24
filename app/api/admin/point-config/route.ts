import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/api'
import { z } from 'zod'

const patchSchema = z.object({
  updates: z.array(z.object({
    config_key: z.string(),
    config_value: z.number().min(0),
  })).min(1),
})

const postSchema = z.object({
  config_key: z.string().min(1),
  config_value: z.number().min(0),
  label: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(['task_type', 'complexity']),
})

export async function PATCH(req: NextRequest) {
  const { profile, error } = await requireAdmin()
  if (error) return error

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createClient()
  const results = []

  for (const { config_key, config_value } of parsed.data.updates) {
    const { data, error: dbError } = await supabase
      .from('point_config')
      .update({ config_value, updated_by: profile!.id, updated_at: new Date().toISOString() })
      .eq('config_key', config_key)
      .select()
      .single()

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
    results.push(data)
  }

  return NextResponse.json(results)
}

export async function POST(req: NextRequest) {
  const { profile, error } = await requireAdmin()
  if (error) return error

  const body = await req.json()
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createClient()
  const { data, error: dbError } = await supabase
    .from('point_config')
    .insert({
      ...parsed.data,
      updated_by: profile!.id,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (dbError) {
    if (dbError.code === '23505') return NextResponse.json({ error: 'A type with that key already exists.' }, { status: 409 })
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const { config_key } = await req.json()
  if (!config_key) return NextResponse.json({ error: 'config_key required' }, { status: 400 })

  const DEADLINE_KEYS = ['deadline_before_multiplier', 'deadline_on_multiplier', 'deadline_after_penalty_per_day']
  if (DEADLINE_KEYS.includes(config_key)) {
    return NextResponse.json({ error: 'Deadline rules cannot be deleted.' }, { status: 403 })
  }

  const supabase = await createClient()
  const { error: dbError } = await supabase.from('point_config').delete().eq('config_key', config_key)
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
