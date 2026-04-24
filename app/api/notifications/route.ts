import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/api'

export async function GET() {
  const { user, error } = await getAuthUser()
  if (error) return error

  const admin = createAdminClient()
  const { data: notifications } = await admin
    .from('notifications')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (!notifications?.length) return NextResponse.json([])

  // Fetch sender profiles for display
  const senderIds = [...new Set(notifications.filter(n => n.sender_id).map(n => n.sender_id as string))]
  let senderMap: Record<string, { full_name: string; avatar_url: string | null }> = {}
  if (senderIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', senderIds)
    senderMap = Object.fromEntries((profiles ?? []).map(p => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]))
  }

  return NextResponse.json(
    notifications.map(n => ({
      ...n,
      sender: n.sender_id ? (senderMap[n.sender_id] ?? null) : null,
    }))
  )
}

export async function PATCH(req: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error) return error

  const body = await req.json()
  const ids: string[] = body.ids ?? []

  const admin = createAdminClient()

  if (ids.length === 0) {
    await admin
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user!.id)
      .eq('read', false)
  } else {
    await admin
      .from('notifications')
      .update({ read: true })
      .in('id', ids)
      .eq('user_id', user!.id)
  }

  return NextResponse.json({ success: true })
}

// DELETE — permanently removes all read notifications for the current user
export async function DELETE() {
  const { user, error } = await getAuthUser()
  if (error) return error

  const admin = createAdminClient()
  const { count, error: dbError } = await admin
    .from('notifications')
    .delete({ count: 'exact' })
    .eq('user_id', user!.id)
    .eq('read', true)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ success: true, deleted: count ?? 0 })
}
