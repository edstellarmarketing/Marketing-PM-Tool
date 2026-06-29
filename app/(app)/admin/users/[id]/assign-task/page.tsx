import { createClient } from '@/lib/supabase/server'
import { requirePageRole, canManage } from '@/lib/api'
import { redirect, notFound } from 'next/navigation'
import AssignTaskForm from '@/components/admin/AssignTaskForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function AssignTaskPage({ params }: Props) {
  const { id } = await params
  const me = await requirePageRole(['admin', 'team_lead'])
  // Team leads may only assign to their own department's members.
  if (!(await canManage(me, id))) redirect('/dashboard')

  const supabase = await createClient()

  const [{ data: targetProfile }, { data: categories }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, avatar_url, is_active').eq('id', id).single(),
    supabase.from('categories').select('name').order('name'),
  ])

  if (!targetProfile) notFound()

  return (
    <AssignTaskForm
      targetUserId={targetProfile.id}
      targetUserName={targetProfile.full_name}
      targetUserAvatar={targetProfile.avatar_url}
      categories={(categories ?? []).map(c => c.name)}
    />
  )
}
