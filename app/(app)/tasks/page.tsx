import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import TaskListClient from '@/components/tasks/TaskListClient'
import TaskFilters from '@/components/tasks/TaskFilters'
import Link from 'next/link'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import type { Task } from '@/types'

interface Props {
  searchParams: Promise<{ status?: string; priority?: string; category?: string; month?: string; year?: string }>
}

export default async function TasksPage({ searchParams }: Props) {
  const params = await searchParams
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  if (profile?.role === 'admin') redirect('/dashboard')
  const isAdmin = false

  let query = adminClient.from('tasks').select('*').or(`user_id.eq.${user!.id},assigned_by.eq.${user!.id}`).order('due_date', { ascending: true, nullsFirst: false })

  if (params.status) query = query.eq('status', params.status)
  if (params.priority) query = query.eq('priority', params.priority)
  if (params.category) query = query.eq('category', params.category)

  const [{ data: tasks }, { data: profiles }] = await Promise.all([
    query,
    adminClient.from('profiles').select('id, full_name, avatar_url, designation').eq('is_active', true),
  ])

  const profileMap: Record<string, { full_name: string; avatar_url: string | null; designation: string | null }> =
    Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
        <Link
          href="/tasks/new"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          + New Task
        </Link>
      </div>

      <Suspense>
        <TaskFilters />
      </Suspense>

      <TaskListClient
        initialTasks={(tasks ?? []) as Task[]}
        isAdmin={isAdmin}
        currentUserId={user!.id}
        profileMap={profileMap}
      />
    </div>
  )
}
