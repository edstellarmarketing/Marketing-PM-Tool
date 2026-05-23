import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  departments: z.array(z.string().min(1)).min(1).max(20).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  task_type: z.string().nullable().optional(),
  complexity: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  award_type_id: z.string().uuid().nullable().optional(),
  bonus_points: z.number().int().min(0).max(10_000).optional(),
  score_weight: z.number().int().min(0).max(10_000).nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await requireAdmin()
  if (error) return error

  const admin = createAdminClient()
  const { data, error: dbErr } = await admin
    .from('announcements')
    .select('*, award_types(id, name, icon, bonus_points), accepted_by_profile:profiles!announcements_accepted_by_fkey(id, full_name, avatar_url), created_by_profile:profiles!announcements_created_by_fkey(id, full_name, avatar_url)')
    .eq('id', id)
    .single()

  if (dbErr || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await requireAdmin()
  if (error) return error

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('announcements')
    .select('status')
    .eq('id', id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.status === 'active') {
    return NextResponse.json({ error: 'Cannot edit an active announcement. Delete it to revoke and re-create.' }, { status: 409 })
  }

  const updates = parsed.data
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
  }

  const { data: updated, error: updErr } = await admin
    .from('announcements')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await requireAdmin()
  if (error) return error

  const admin = createAdminClient()
  // Attachments rows cascade via FK. Storage objects need explicit cleanup.
  const { data: attachments } = await admin
    .from('announcement_attachments')
    .select('storage_path')
    .eq('announcement_id', id)

  const { error: delErr } = await admin.from('announcements').delete().eq('id', id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (attachments && attachments.length > 0) {
    const paths = attachments.map(a => a.storage_path).filter(Boolean)
    if (paths.length > 0) {
      await admin.storage.from('announcement-attachments').remove(paths)
    }
  }

  return NextResponse.json({ success: true })
}
