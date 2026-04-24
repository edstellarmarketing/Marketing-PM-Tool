import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/api'
import { z } from 'zod'

const timelineSchema = z.object({
  label: z.string().min(1),
  date:  z.string().nullable().optional(),
})

const updateNoteSchema = z.object({
  title:        z.string().min(1).max(200).optional(),
  meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  goal:         z.string().min(1).optional(),
  body:         z.string().nullable().optional(),
  timelines:    z.array(timelineSchema).max(10).optional(),
  met_with:     z.string().nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, error } = await getAuthUser()
  if (error) return error

  const supabase = await createClient()
  const { data, error: dbError } = await supabase
    .from('meeting_notes')
    .select('*')
    .eq('id', id)
    .eq('user_id', user!.id)
    .single()

  if (dbError) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, error } = await getAuthUser()
  if (error) return error

  const body = await req.json()
  const parsed = updateNoteSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const supabase = await createClient()
  const { data, error: dbError } = await supabase
    .from('meeting_notes')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user!.id)
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, error } = await getAuthUser()
  if (error) return error

  const supabase = await createClient()
  const { error: dbError } = await supabase
    .from('meeting_notes')
    .delete()
    .eq('id', id)
    .eq('user_id', user!.id)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
