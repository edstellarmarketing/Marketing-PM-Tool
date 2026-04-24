import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const patchSchema = z.object({
  is_active: z.boolean(),
})

interface Props {
  params: Promise<{ id: string }>
}

export async function PATCH(req: NextRequest, { params }: Props) {
  const { profile: adminProfile, error } = await requireAdmin()
  if (error) return error

  const { id } = await params
  if (adminProfile?.id === id) {
    return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 })
  }

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const adminClient = createAdminClient()
  const { data: existingProfile, error: findError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('id', id)
    .single()

  if (findError || !existingProfile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { error: authError } = await adminClient.auth.admin.updateUserById(id, {
    ban_duration: parsed.data.is_active ? 'none' : '876000h',
  })

  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

  const { error: profileError } = await adminClient
    .from('profiles')
    .update({ is_active: parsed.data.is_active })
    .eq('id', id)

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const { profile: adminProfile, error } = await requireAdmin()
  if (error) return error

  const { id } = await params
  if (adminProfile?.id === id) {
    return NextResponse.json({ error: 'You cannot remove your own account' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Step 1: notifications — no triggers
  await adminClient.from('notifications').delete().eq('user_id', id)

  // Step 2: tasks — tr_on_task_change fires and may upsert monthly_scores/performance_summaries.
  // Profile still exists here so any FK writes succeed.
  await adminClient.from('tasks').delete().eq('user_id', id)

  // Step 3: monthly_scores — triggers may re-insert performance_summaries rows.
  // Profile still exists so those writes succeed.
  await adminClient.from('monthly_scores').delete().eq('user_id', id)

  // Step 4: performance_summaries — now safe to wipe (triggers already settled, profile still exists)
  const { error: psError } = await adminClient.from('performance_summaries').delete().eq('user_id', id)
  if (psError) return NextResponse.json({ error: `Failed to delete performance summaries: ${psError.message}` }, { status: 500 })

  // Step 5: profile — no remaining FK references
  const { error: profileError } = await adminClient.from('profiles').delete().eq('id', id)
  if (profileError) return NextResponse.json({ error: `Failed to delete profile: ${profileError.message}` }, { status: 500 })

  // Step 6: auth user
  const { error: authError } = await adminClient.auth.admin.deleteUser(id)
  if (authError) return NextResponse.json({ error: `Auth error: ${authError.message}` }, { status: 500 })

  return NextResponse.json({ success: true })
}
