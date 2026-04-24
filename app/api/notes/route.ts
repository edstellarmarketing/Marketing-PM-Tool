import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/api'
import { z } from 'zod'

const timelineSchema = z.object({
  label: z.string().min(1),
  date:  z.string().nullable().optional(),
})

const createNoteSchema = z.object({
  title:        z.string().min(1).max(200),
  meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  goal:         z.string().min(1),
  body:         z.string().nullable().optional(),
  timelines:    z.array(timelineSchema).max(10).optional().default([]),
  met_with:     z.string().nullable().optional(),
})

export async function GET() {
  const { user, error } = await getAuthUser()
  if (error) return error

  const supabase = await createClient()
  const { data, error: dbError } = await supabase
    .from('meeting_notes')
    .select('*')
    .eq('user_id', user!.id)
    .order('meeting_date', { ascending: false })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error) return error

  const body = await req.json()
  const parsed = createNoteSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createClient()
  const { data, error: dbError } = await supabase
    .from('meeting_notes')
    .insert({ ...parsed.data, user_id: user!.id })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
