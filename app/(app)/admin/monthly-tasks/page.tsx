import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MonthlyTasksClient from '@/components/admin/MonthlyTasksClient'

export default async function MonthlyTasksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: members } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('role', 'member')
    .eq('is_active', true)
    .order('full_name')

  return <MonthlyTasksClient members={members ?? []} />
}
