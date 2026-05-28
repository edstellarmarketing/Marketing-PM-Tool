import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import ProjectDashboard from '@/components/projects/ProjectDashboard'
import type { Project, ProjectTask, Profile, ProjectOwner, ProjectOwnerMember } from '@/types'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (!project) notFound()

  // PostgREST caps a single response at 1000 rows. Page through so projects
  // with more than 1000 tasks render fully.
  const tasksPromise = (async (): Promise<ProjectTask[]> => {
    const PAGE = 1000
    const out: ProjectTask[] = []
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase
        .from('project_tasks')
        .select('*')
        .eq('project_id', id)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1)
      if (!data || data.length === 0) break
      out.push(...(data as ProjectTask[]))
      if (data.length < PAGE) break
    }
    return out
  })()

  const [tasks, ownersRes, membersRes, allMembersRes] = await Promise.all([
    tasksPromise,
    supabase.from('project_owners').select('*').eq('project_id', id).order('created_at', { ascending: true }),
    supabase.from('project_owner_members').select('*'),
    supabase.from('profiles').select('id, full_name, avatar_url').order('full_name', { ascending: true }),
  ])
  const owners = (ownersRes.data ?? []) as ProjectOwner[]
  const allMembers = (allMembersRes.data ?? []) as Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]
  const ownerMembers = (membersRes.data ?? []) as ProjectOwnerMember[]

  const ownerIds = owners.map(o => o.id)
  const memberRowsForProject = ownerMembers.filter(m => ownerIds.includes(m.owner_id))

  const userIdsNeeded = new Set<string>()
  owners.forEach(o => userIdsNeeded.add(o.user_id))
  memberRowsForProject.forEach(m => userIdsNeeded.add(m.user_id))
  tasks.forEach(t => { if (t.assignee_id) userIdsNeeded.add(t.assignee_id) })

  const profileById = new Map(allMembers.map(p => [p.id, p]))

  const ownersWithMembers: ProjectOwner[] = owners.map(o => ({
    ...o,
    user: profileById.get(o.user_id) ?? null,
    members: memberRowsForProject
      .filter(m => m.owner_id === o.id)
      .map(m => ({ ...m, user: profileById.get(m.user_id) ?? null })),
  }))

  return (
    <ProjectDashboard
      project={project as Project}
      tasks={tasks}
      owners={ownersWithMembers}
      allMembers={allMembers}
      isAdmin={isAdmin}
    />
  )
}
