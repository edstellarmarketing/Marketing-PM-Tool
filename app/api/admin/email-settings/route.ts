import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const patchSchema = z.object({
  key: z.string().min(1),
  enabled: z.boolean().optional(),
  send_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
}).refine(d => d.enabled !== undefined || d.send_time !== undefined, {
  message: 'Must provide enabled or send_time',
})

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const admin = createAdminClient()
  const { data, error: dbError } = await admin
    .from('email_settings')
    .select('key, enabled, send_time')
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  const settings: Record<string, { enabled: boolean; send_time: string }> = {}
  for (const row of data ?? []) {
    settings[row.key] = { enabled: row.enabled, send_time: row.send_time ?? '09:00' }
  }
  return NextResponse.json(settings)
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const update: Record<string, unknown> = { key: parsed.data.key, updated_at: new Date().toISOString() }
  if (parsed.data.enabled !== undefined) update.enabled = parsed.data.enabled
  if (parsed.data.send_time !== undefined) update.send_time = parsed.data.send_time

  const admin = createAdminClient()
  const { error: dbError } = await admin.from('email_settings').upsert(update)
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
