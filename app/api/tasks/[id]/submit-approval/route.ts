import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/api'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, error } = await getAuthUser()
  if (error) return error

  const supabase = await createClient()
  const { data: task } = await supabase.from('tasks').select('approval_status, user_id').eq('id', id).single()

  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (task.user_id !== user!.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (task.approval_status !== 'draft') {
    return NextResponse.json({ error: 'Only draft tasks can be submitted for approval.' }, { status: 400 })
  }

  const { data, error: dbError } = await supabase
    .from('tasks')
    .update({ approval_status: 'pending_approval' })
    .eq('id', id)
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  // Notify admins
  const admin = createAdminClient()
  const { data: adminProfiles } = await admin.from('profiles').select('id').eq('role', 'admin')
  if (adminProfiles?.length) {
    await admin.from('notifications').insert(
      adminProfiles.map(a => ({
        user_id: a.id,
        title: 'Task Pending Approval',
        body: `A task has been submitted for your approval.`,
      }))
    )
  }

  return NextResponse.json(data)
}
