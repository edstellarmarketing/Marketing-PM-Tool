import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProjectsClient from '@/components/projects/ProjectsClient'
import type { Project, ProjectTask } from '@/types'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })

  const projectList = (projects ?? []) as Project[]
  const projectIds = projectList.map(p => p.id)

  let taskStats: Record<string, { total: number; completed: number; in_progress: number; pending: number; overdue: number }> = {}
  if (projectIds.length > 0) {
    // PostgREST caps a single response at 1000 rows. Page through so stats
    // stay accurate when total tasks across the listed projects exceed 1000.
    const PAGE = 1000
    const today = new Date().toISOString().slice(0, 10)
    for (let from = 0; ; from += PAGE) {
      const { data: tasks } = await supabase
        .from('project_tasks')
        .select('project_id, status, due_date')
        .in('project_id', projectIds)
        .range(from, from + PAGE - 1)
      if (!tasks || tasks.length === 0) break
      for (const t of tasks as Pick<ProjectTask, 'project_id' | 'status' | 'due_date'>[]) {
        const s = taskStats[t.project_id] ?? { total: 0, completed: 0, in_progress: 0, pending: 0, overdue: 0 }
        s.total += 1
        if (t.status === 'completed') s.completed += 1
        else if (t.status === 'in_progress') s.in_progress += 1
        else s.pending += 1
        if (t.status !== 'completed' && t.due_date && t.due_date < today) s.overdue += 1
        taskStats[t.project_id] = s
      }
      if (tasks.length < PAGE) break
    }
  }

  return <ProjectsClient projects={projectList} stats={taskStats} isAdmin={isAdmin} />
}
