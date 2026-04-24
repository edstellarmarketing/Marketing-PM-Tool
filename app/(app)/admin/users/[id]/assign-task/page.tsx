import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import AssignTaskForm from '@/components/admin/AssignTaskForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function AssignTaskPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (adminProfile?.role !== 'admin') redirect('/dashboard')

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
