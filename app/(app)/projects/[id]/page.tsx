import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import ProjectDashboard from '@/components/projects/ProjectDashboard'
import type { Project, ProjectTask, Profile, ProjectOwner, ProjectOwnerMember } from '@/types'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const [tasksRes, ownersRes, membersRes, allMembersRes] = await Promise.all([
    supabase.from('project_tasks').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('project_owners').select('*').eq('project_id', id).order('created_at', { ascending: true }),
    supabase.from('project_owner_members').select('*'),
    supabase.from('profiles').select('id, full_name, avatar_url').order('full_name', { ascending: true }),
  ])

  const tasks = (tasksRes.data ?? []) as ProjectTask[]
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
    />
  )
}
