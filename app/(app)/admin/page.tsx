import { createAdminClient } from '@/lib/supabase/admin'
import { requirePageRole } from '@/lib/api'
import AdminClient from '@/components/admin/AdminClient'
import type { Profile, Category } from '@/types'

export default async function AdminPage() {
  const me = await requirePageRole(['admin', 'team_lead'])
  const isAdmin = me.role === 'admin'

  const adminClient = createAdminClient()

  // Team leads see only their own department's roster (read-only).
  let profilesQuery = adminClient.from('profiles').select('*').order('full_name')
  if (!isAdmin) profilesQuery = profilesQuery.eq('department', me.department ?? '__none__')

  const [{ data: profiles }, authUsersResult, { data: categories }] = await Promise.all([
    profilesQuery,
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
        <h1 className="text-2xl font-bold text-gray-900">{isAdmin ? 'Admin' : 'Team'}</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {isAdmin ? 'Manage users and departments' : `Your department's members · ${me.department ?? 'no department set'}`}
        </p>
      </div>
      <AdminClient
        users={usersWithEmail}
        departments={(categories ?? []) as Category[]}
        currentUserId={me.id}
        isAdmin={isAdmin}
      />
    </div>
  )
}
