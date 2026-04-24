import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import AdminClient from '@/components/admin/AdminClient'
import type { Profile, Category } from '@/types'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  if (myProfile?.role !== 'admin') redirect('/dashboard')

  const adminClient = createAdminClient()

  const [{ data: profiles }, authUsersResult, { data: categories }] = await Promise.all([
    adminClient.from('profiles').select('*').order('full_name'),
    adminClient.auth.admin.listUsers({ perPage: 200 }),
    adminClient.from('categories').select('*').order('name'),
  ])

  // Build email lookup from auth users
  const emailMap: Record<string, string> = {}
  for (const u of (authUsersResult.data?.users ?? [])) {
    if (u.email) emailMap[u.id] = u.email
  }

  const usersWithEmail = (profiles ?? []).map((p: Profile) => ({
    ...p,
    email: emailMap[p.id] ?? null,
  }))

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin</h1>
        <p className="text-gray-500 text-sm mt-0.5">Manage users and departments</p>
      </div>
      <AdminClient
        users={usersWithEmail}
        departments={(categories ?? []) as Category[]}
        currentUserId={user!.id}
      />
    </div>
  )
}
