import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProjectsClient from '@/components/projects/ProjectsClient'
import type { Project, ProjectTask } from '@/types'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  const projectList = (projects ?? []) as Project[]
  const projectIds = projectList.map(p => p.id)

  let taskStats: Record<string, { total: number; completed: number; in_progress: number; pending: number; overdue: number }> = {}
  if (projectIds.length > 0) {
    const { data: tasks } = await supabase
      .from('project_tasks')
      .select('project_id, status, due_date')
      .in('project_id', projectIds)

    const today = new Date().toISOString().slice(0, 10)
    taskStats = (tasks ?? []).reduce<typeof taskStats>((acc, t: Pick<ProjectTask, 'project_id' | 'status' | 'due_date'>) => {
      const s = acc[t.project_id] ?? { total: 0, completed: 0, in_progress: 0, pending: 0, overdue: 0 }
      s.total += 1
      if (t.status === 'completed') s.completed += 1
      else if (t.status === 'in_progress') s.in_progress += 1
      else s.pending += 1
      if (t.status !== 'completed' && t.due_date && t.due_date < today) s.overdue += 1
      acc[t.project_id] = s
      return acc
    }, {})
  }

  return <ProjectsClient projects={projectList} stats={taskStats} />
}
