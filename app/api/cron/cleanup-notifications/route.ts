import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Called by Vercel Cron daily at 02:00 UTC
// Deletes read notifications older than 7 days and unread notifications older than 30 days
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { error: readError, count: readCount } = await supabase
    .from('notifications')
    .delete({ count: 'exact' })
    .eq('read', true)
    .lt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })

  const { error: unreadError, count: unreadCount } = await supabase
    .from('notifications')
    .delete({ count: 'exact' })
    .eq('read', false)
    .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

  if (unreadError) return NextResponse.json({ error: unreadError.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    deleted: { read: readCount ?? 0, unread: unreadCount ?? 0 },
  })
}
