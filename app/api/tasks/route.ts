import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser } from '@/lib/api'
import { z } from 'zod'

const subTaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  completed: z.boolean().default(false),
  due_date: z.string().nullable().optional(),
})

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  task_type: z.string().optional(),
  complexity: z.string().optional(),
  start_date: z.string().optional(),
  due_date: z.string().optional(),
  plan_id: z.string().uuid().optional(),
  goal_id: z.string().optional(),
  is_draft: z.boolean().default(false),
  subtasks: z.array(subTaskSchema).optional(),
  user_id: z.string().uuid().optional(), // admin-only: assign task to another user
  parent_task_id: z.string().uuid().optional(),
  dependencies: z.array(z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    user_id: z.string().uuid(),
    due_date: z.string().optional(),
    task_type: z.string().optional(),
    complexity: z.string().optional(),
    category: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  })).optional(),
})

export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error) return error

  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const priority = searchParams.get('priority')
  const category = searchParams.get('category')
  const task_type = searchParams.get('task_type')
  const complexity = searchParams.get('complexity')

  let query = supabase.from('tasks').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)
  if (category) query = query.eq('category', category)
  if (task_type) query = query.eq('task_type', task_type)
  if (complexity) query = query.eq('complexity', complexity)

  const { data, error: dbError } = await query
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser()
  if (error) return error

  const body = await req.json()
  const parsed = createTaskSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Validate subtask due dates fall within the task's date range
  const { subtasks: parsedSubtasks, start_date: taskStart, due_date: taskDue } = parsed.data
  if (parsedSubtasks && parsedSubtasks.length > 0 && (taskStart || taskDue)) {
    for (const subtask of parsedSubtasks) {
      if (!subtask.due_date) continue
      if (taskStart && subtask.due_date < taskStart) {
        return NextResponse.json(
          { error: `Sub-task "${subtask.title}" has a due date before the task start date.` },
          { status: 400 },
        )
      }
      if (taskDue && subtask.due_date > taskDue) {
        return NextResponse.json(
          { error: `Sub-task "${subtask.title}" has a due date after the task due date.` },
          { status: 400 },
        )
      }
    }
  }

  const supabase = await createClient()

  // Admin can assign tasks to other users; regular users can only create for themselves.
  let targetUserId = user!.id
  let isAdminAssigning = false
  if (parsed.data.user_id && parsed.data.user_id !== user!.id) {
    const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
    if (adminProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can assign tasks to other users' }, { status: 403 })
    }
    targetUserId = parsed.data.user_id
    isAdminAssigning = true
  }

  // When admin is assigning to another user, use the admin client to bypass RLS
  const adminClient = createAdminClient()
  const insertClient = isAdminAssigning ? adminClient : supabase

  const { user_id: _userId, dependencies, ...rest } = parsed.data
  const { data: mainTask, error: dbError } = await insertClient
    .from('tasks')
    .insert({
      ...rest,
      user_id: targetUserId,
      approval_status: 'approved',
      assigned_by: isAdminAssigning ? user!.id : null,
      scoring_locked: isAdminAssigning,
    })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  // Handle dependencies if provided
  if (dependencies && dependencies.length > 0) {
    const dependencyTasks = dependencies.map(dep => ({
      ...dep,
      parent_task_id: mainTask.id,
      approval_status: 'approved',
      assigned_by: user!.id,
      scoring_locked: false, // dependencies assigned by users can be edited by them? or locked?
    }))

    const { data: createdDeps, error: depError } = await adminClient.from('tasks').insert(dependencyTasks).select('id, user_id, title')
    if (depError) {
      console.error('Error creating dependencies:', depError)
    } else if (createdDeps) {
      const notifications = createdDeps.map(dep => ({
        user_id: dep.user_id,
        sender_id: user!.id,
        title: 'New dependency task assigned',
        body: `You have been assigned a dependency task: "${dep.title}" linked to "${mainTask.title}"`,
        link: `/tasks/${dep.id}`,
      }))
      await adminClient.from('notifications').insert(notifications)
    }
  }

  return NextResponse.json(mainTask, { status: 201 })
}
