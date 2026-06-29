import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import type { Profile, Role } from '@/types'

export async function getAuthUser(): Promise<{ user: { id: string } | null; error: NextResponse | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { user, error: null }
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
  return data
}

// Server-component (page) guard. Redirects to /login if signed out, or to
// /dashboard if the role isn't allowed. Returns the caller's profile so the
// page can scope its queries (e.g. by profile.department for team leads).
export async function requirePageRole(allowed: Role[]): Promise<Profile> {
  const { user } = await getAuthUser()
  if (!user) redirect('/login')
  const profile = await getProfile(user.id)
  if (!profile || !allowed.includes(profile.role)) redirect('/dashboard')
  return profile
}

export async function requireAdmin(): Promise<{ profile: Profile | null; error: NextResponse | null }> {
  const { user, error } = await getAuthUser()
  if (error || !user) return { profile: null, error: error! }

  const profile = await getProfile(user.id)
  if (!profile || profile.role !== 'admin') {
    return { profile: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { profile, error: null }
}

// Allows admins and team leads. Use for delegated, department-scoped features:
// the returned profile carries `role` and `department` so the handler can scope
// its queries (admins see everything; team leads should filter to their own
// department). Mirrors the is_team_lead() / my_department() SQL helpers.
export async function requireAdminOrTeamLead(): Promise<{ profile: Profile | null; error: NextResponse | null }> {
  const { user, error } = await getAuthUser()
  if (error || !user) return { profile: null, error: error! }

  const profile = await getProfile(user.id)
  if (!profile || (profile.role !== 'admin' && profile.role !== 'team_lead')) {
    return { profile: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { profile, error: null }
}

// Does `profile` manage `targetUserId`? Admins manage everyone; a team lead
// manages users in their own (non-null) department. Pure check (no HTTP), so
// handlers that already loaded their profile can authorize a specific row.
// Uses the service-role client so it works inside admin-client routes.
export async function canManage(profile: Profile, targetUserId: string): Promise<boolean> {
  if (profile.role === 'admin') return true
  if (profile.role !== 'team_lead' || !profile.department) return false
  if (targetUserId === profile.id) return true
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('department').eq('id', targetUserId).single()
  return !!data && data.department === profile.department
}

// Can `profile` manage this project? Admins always; team leads only for
// projects they created. Mirrors the project_owners RLS (admin OR creator).
export async function canManageProject(profile: Profile, projectId: string): Promise<boolean> {
  if (profile.role === 'admin') return true
  if (profile.role !== 'team_lead') return false
  const admin = createAdminClient()
  const { data } = await admin.from('projects').select('created_by').eq('id', projectId).single()
  return !!data && data.created_by === profile.id
}

// IDs of every user in a department. Returns [] for a falsy department, so an
// `.in('user_id', ids)` filter naturally yields no rows (a team lead with no
// department sees nothing). Service-role client — bypasses RLS by design.
export async function departmentUserIds(department: string | null | undefined): Promise<string[]> {
  if (!department) return []
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id').eq('department', department)
  return (data ?? []).map((p: { id: string }) => p.id)
}

// Authorizes acting ON a specific user: admins manage everyone; a team lead
// manages users in their own (non-null) department. Mirrors manages_user() in
// SQL. Returns the caller's profile on success.
export async function requireManages(targetUserId: string): Promise<{ profile: Profile | null; error: NextResponse | null }> {
  const { profile, error } = await requireAdminOrTeamLead()
  if (error || !profile) return { profile: null, error: error! }

  if (await canManage(profile, targetUserId)) return { profile, error: null }
  return { profile: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
}
