import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { redirect, notFound } from 'next/navigation'
import type { ModuleKey, Profile, Role } from '@/types'

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

// Is `profile` a member "involved" in this project? True for a project owner
// (a department head on the project) or a member listed under one of those
// owners. Admins short-circuit to true. Service-role client — bypasses RLS by
// design, so the route handler is the authorization boundary.
export async function isProjectMember(profile: Profile, projectId: string): Promise<boolean> {
  if (profile.role === 'admin') return true
  const admin = createAdminClient()

  const { data: owners } = await admin
    .from('project_owners')
    .select('id, user_id')
    .eq('project_id', projectId)
  const ownerRows = owners ?? []
  if (ownerRows.some((o: { user_id: string }) => o.user_id === profile.id)) return true

  const ownerIds = ownerRows.map((o: { id: string }) => o.id)
  if (ownerIds.length === 0) return false
  const { data: asMember } = await admin
    .from('project_owner_members')
    .select('id')
    .eq('user_id', profile.id)
    .in('owner_id', ownerIds)
    .limit(1)
  return (asMember?.length ?? 0) > 0
}

// Can `profile` contribute tasks to this project (e.g. bulk import, and the
// group creation that import depends on)? Admins and the managing team lead
// always can (see canManageProject); additionally any member involved in the
// project may. Broader than canManageProject on purpose — contributing tasks is
// not the same as managing the project.
export async function canContributeToProject(profile: Profile, projectId: string): Promise<boolean> {
  if (await canManageProject(profile, projectId)) return true
  return isProjectMember(profile, projectId)
}

// Route guard for project-contribution endpoints. Unlike requireAdminOrTeamLead,
// this does NOT reject members up front — any authenticated user is allowed
// through iff they can contribute to the given project. Returns the caller's
// profile on success (handlers use it for created_by, etc.).
export async function requireProjectContributor(
  projectId: string,
): Promise<{ profile: Profile | null; error: NextResponse | null }> {
  const { user, error } = await getAuthUser()
  if (error || !user) return { profile: null, error: error! }
  const profile = await getProfile(user.id)
  if (!profile || !(await canContributeToProject(profile, projectId))) {
    return { profile: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { profile, error: null }
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

// ─── Hidden modules ──────────────────────────────────────────────────────────
// A hidden module has no sidebar entry and is excluded from global search; the
// only way in is an explicit row in `module_access` (migration 071). Access is
// independent of `profiles.role` — an admin does NOT get in by being an admin.
//
// Every guard below answers "no" as a 404, never a 403, so a user without
// access cannot tell the route apart from one that doesn't exist. Do not
// "improve" these into 403s or descriptive errors — the status code is the
// concealment.

// Roles within a hidden module (migration 075). `viewer` reads everything and
// changes nothing; `manager` adds, edits and deletes. The module owner is always
// treated as a manager — see moduleRole().
export type ModuleRole = 'viewer' | 'manager'

// Does `userId` hold `moduleKey`? Service-role client: `module_access` is not
// readable by the `authenticated` role at all (RLS on, no policies, no grant),
// so this is the only way to check from application code.
export async function hasModuleAccess(userId: string, moduleKey: ModuleKey): Promise<boolean> {
  return (await moduleRole(userId, moduleKey)) !== null
}

// The caller's role, or null if they hold no grant. The module owner is
// force-promoted to `manager`: they can grant access to themselves anyway, so
// letting a stale `viewer` row lock them out of their own module would be a
// footgun with no security benefit.
export async function moduleRole(userId: string, moduleKey: ModuleKey): Promise<ModuleRole | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('module_access')
    .select('role')
    .eq('user_id', userId)
    .eq('module_key', moduleKey)
    .maybeSingle()
  if (!data) return null
  if (await isModuleGrantor(userId)) return 'manager'
  return (data.role as ModuleRole) ?? 'viewer'
}

// Route-handler guard. Returns a 404 NextResponse for signed-out users and for
// signed-in users without the module — the two cases are intentionally
// indistinguishable. Returns the caller's profile on success.
export async function requireModuleAccess(
  moduleKey: ModuleKey,
): Promise<{ profile: Profile | null; error: NextResponse | null }> {
  const notFoundResponse = NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { user } = await getAuthUser()
  if (!user) return { profile: null, error: notFoundResponse }

  const profile = await getProfile(user.id)
  if (!profile || !(await hasModuleAccess(user.id, moduleKey))) {
    return { profile: null, error: notFoundResponse }
  }
  return { profile, error: null }
}

// Server-component (page) guard — the hidden-module counterpart to
// requirePageRole. Renders the standard app 404 (app/not-found.tsx) instead of
// redirecting to /dashboard, so the page leaks nothing about the route's
// existence. Returns the caller's profile so the page can scope its queries.
export async function requirePageModuleAccess(moduleKey: ModuleKey): Promise<Profile> {
  const { user } = await getAuthUser()
  if (!user) notFound()

  const profile = await getProfile(user.id)
  if (!profile || !(await hasModuleAccess(user.id, moduleKey))) notFound()
  return profile
}

// Page-level access check that does NOT throw. Returns null when the signed-in
// user holds no grant, so the page can render an explicit "no access" screen
// rather than a 404.
//
// This is a deliberate change of posture for the expenses module: a 404 conceals
// that the module exists, an access screen admits it and tells the reader whom
// to ask. The sidebar entry stays hidden from people without a grant, so the
// only way to reach the screen is a direct link someone shared with you.
export async function getModuleAccess(
  moduleKey: ModuleKey,
): Promise<{ profile: Profile; role: ModuleRole; isOwner: boolean } | null> {
  const { user } = await getAuthUser()
  if (!user) redirect('/login')

  const profile = await getProfile(user.id)
  if (!profile) redirect('/login')

  const role = await moduleRole(user.id, moduleKey)
  if (!role) return null
  return { profile, role, isOwner: await isModuleGrantor(user.id) }
}

// Route guard requiring at least manager rights. Viewers get a 403 with a
// readable reason — unlike the module-level 404, there is nothing to conceal
// here: the caller already knows the module exists.
export async function requireModuleManager(
  moduleKey: ModuleKey,
): Promise<{ profile: Profile | null; error: NextResponse | null }> {
  const { profile, error } = await requireModuleAccess(moduleKey)
  if (error || !profile) return { profile: null, error: error! }

  const role = await moduleRole(profile.id, moduleKey)
  if (role !== 'manager') {
    return {
      profile: null,
      error: NextResponse.json(
        { error: 'Your access to Expenses is read-only. Ask the module owner for manager rights.' },
        { status: 403 },
      ),
    }
  }
  return { profile, error: null }
}

// The single account allowed to grant/revoke hidden-module access. Overridable
// per-deploy, but never empty: an unset env var falls back to the literal
// rather than matching everyone.
const MODULE_GRANTOR_EMAIL = (process.env.MODULE_GRANTOR_EMAIL || 'vijay@edstellar.com').toLowerCase()

// Guard for the module's own access-management endpoints. Only the module
// grantor may grant or revoke. Holding the `admin` role is NOT sufficient and
// neither is already having the module — otherwise anyone granted access could
// widen the circle. Also 404s rather than 403s, so a user who has the module
// but isn't the grantor learns nothing about the management endpoints.
export async function requireModuleGrantor(
  moduleKey: ModuleKey,
): Promise<{ profile: Profile | null; error: NextResponse | null }> {
  const { profile, error } = await requireModuleAccess(moduleKey)
  if (error || !profile) return { profile: null, error: error! }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.email?.toLowerCase() !== MODULE_GRANTOR_EMAIL) {
    return { profile: null, error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  return { profile, error: null }
}

// Is `userId` the module grantor? For rendering — lets the page show or hide
// the access-management panel. Never the sole gate on a mutation; the route
// handler must still call requireModuleGrantor.
export async function isModuleGrantor(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin.auth.admin.getUserById(userId)
  return data?.user?.email?.toLowerCase() === MODULE_GRANTOR_EMAIL
}

// Guard for destructive actions inside the expenses module.
//
// Deletion used to be the module owner's alone. Since migration 075 it belongs
// to the `manager` role — a ledger manager adds, edits and deletes, and nobody
// without that role can. The owner is force-promoted to manager in moduleRole(),
// so they keep everything they had.
export async function requireExpenseDeleter(): Promise<{ profile: Profile | null; error: NextResponse | null }> {
  return requireModuleManager('expenses')
}
