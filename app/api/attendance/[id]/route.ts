import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser, requireAdmin } from '@/lib/api'
import { z } from 'zod'

const updateStatusSchema = z.object({
  status: z.enum(['approved', 'rejected']),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await requireAdmin()
  if (error) return error

  const body = await req.json()
  const parsed = updateStatusSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const adminClient = createAdminClient()
  const { data, error: dbError } = await adminClient
    .from('attendance_leaves')
    .update({ status: parsed.data.status })
    .eq('id', id)
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

  // Check existence and approval status before deleting
  const { data: existing } = await supabase
    .from('attendance_leaves')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', user!.id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'approved') {
    return NextResponse.json({ error: 'Approved leaves cannot be removed' }, { status: 403 })
  }

  const { error: dbError } = await supabase
    .from('attendance_leaves')
    .delete()
    .eq('id', id)
    .eq('user_id', user!.id)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
