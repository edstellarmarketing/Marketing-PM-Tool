import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser, requireAdminOrTeamLead } from '@/lib/api'

const createSchema = z.object({
  name: z.string().min(1).max(120),
  domain: z.enum(['Edstellar', 'Invensis']),
  description: z.string().max(2000).optional().nullable(),
  start_date: z.string().optional().nullable(),
  end_date: z.string().optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  status: z.enum(['active', 'on_hold', 'completed', 'archived']).optional(),
})

export async function GET() {
  const { user, error } = await getAuthUser()
  if (error || !user) return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data, error: dbError } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { profile, error } = await requireAdminOrTeamLead()
  if (error || !profile) return error ?? NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Projects RLS is admin-only (migration 056); team leads are authorized here
  // at the handler layer, so write via the service-role client.
  const supabase = createAdminClient()
  const { data, error: dbError } = await supabase
    .from('projects')
    .insert({
      name: parsed.data.name,
      domain: parsed.data.domain,
      description: parsed.data.description ?? null,
      start_date: parsed.data.start_date || null,
      end_date: parsed.data.end_date || null,
      color: parsed.data.color ?? null,
      status: parsed.data.status ?? 'active',
      created_by: profile.id,
    })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
