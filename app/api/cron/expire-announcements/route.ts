import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Daily expiry of open announcements past their 30-day window.
 * Called by Vercel Cron; auth via Bearer CRON_SECRET.
 *
 * The DB function does the DELETE in one statement and returns the row count.
 * Cascading FKs on `announcement_attachments` clean the table rows; we then
 * sweep orphaned storage objects in a second step so the bucket doesn't leak.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // 1. Gather storage paths about to be orphaned (rows are deleted in step 2 via CASCADE).
  const { data: expiringIds } = await admin
    .from('announcements')
    .select('id')
    .eq('status', 'open')
    .lt('expires_at', new Date().toISOString())

  let orphanedPaths: string[] = []
  if (expiringIds && expiringIds.length > 0) {
    const ids = expiringIds.map(a => a.id)
    const { data: atts } = await admin
      .from('announcement_attachments')
      .select('storage_path')
      .in('announcement_id', ids)
    orphanedPaths = (atts ?? []).map(a => a.storage_path).filter(Boolean)
  }

  // 2. Delete expired rows via the SQL function (returns count).
  const { data: deleted, error: rpcErr } = await admin.rpc('expire_open_announcements')
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })

  // 3. Clean up storage objects for the rows we just removed.
  if (orphanedPaths.length > 0) {
    await admin.storage.from('announcement-attachments').remove(orphanedPaths)
  }

  return NextResponse.json({
    success: true,
    deleted_count: typeof deleted === 'number' ? deleted : 0,
    cleaned_storage_objects: orphanedPaths.length,
  })
}
