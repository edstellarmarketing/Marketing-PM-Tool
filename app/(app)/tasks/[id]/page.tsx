import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Clock, Tag, Zap, ArrowRight, StickyNote, RefreshCw, Pencil, CalendarDays, Link as LinkIcon } from 'lucide-react'
import { formatDate, cn, isOverdue } from '@/lib/utils'
import TaskSubtasksStatusSection from '@/components/tasks/TaskSubtasksStatusSection'
import PrioritySelect from '@/components/tasks/PrioritySelect'
import DependencyDashboard from '@/components/tasks/DependencyDashboard'
import GiveAwardButton from '@/components/admin/GiveAwardButton'
import type { DependencyChildData } from '@/components/tasks/DependencyAccordion'
import type { Task, TaskUpdate } from '@/types'
import { volumeTierFor, volumeTiersFromConfig } from '@/lib/scoring'

const statusStyles: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  review: 'bg-yellow-100 text-yellow-700',
  done: 'bg-green-100 text-green-700',
  blocked: 'bg-red-100 text-red-700',
}

const statusLabels: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'In Review',
  done: 'Done',
  blocked: 'Blocked',
}

const taskTypeLabels: Record<string, string> = {
  monthly_task: '🔁 Monthly Task',
  new_implementation: '🚀 New Implementation',
  ai: '🤖 AI',
}

const complexityLabels: Record<string, string> = {
  easy: '🟢 Easy',
  medium: '🟡 Medium',
  difficult: '🔴 Difficult',
}

function formatUpdateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function TaskDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  const [{ data }, { data: pointConfigRows }, { data: childRows }, { data: viewerProfile }, { data: existingAward }] = await Promise.all([
    adminClient.from('tasks').select('*, task_updates(*)').eq('id', id).single(),
    supabase.from('point_config').select('config_key,config_value,label'),
    // Use adminClient so the dependency children always show for any user who can
    // reach this main task page, regardless of RLS scoping on individual children.
    adminClient
      .from('tasks')
      .select('id, title, description, status, approval_status, user_id, due_date, start_date, completion_date, score_weight, score_earned, task_type, complexity, subtasks, approval_note')
      .eq('parent_task_id', id)
      .order('due_date', { ascending: true, nullsFirst: false }),
    authUser ? supabase.from('profiles').select('role').eq('id', authUser.id).single() : Promise.resolve({ data: null }),
    adminClient.from('user_awards').select('id, bonus_points, award_types(name, icon)').eq('task_id', id).maybeSingle(),
  ])

  if (!data) notFound()

  const isViewerAdmin = viewerProfile?.role === 'admin'
  const isOwner = !!authUser && data.user_id === authUser.id

  // Authorization: task owner and admins can always view.
  // Non-owners may view if they are the assigner or the owner of the parent task.
  if (!isViewerAdmin && !isOwner && authUser) {
    let authorized = (data as unknown as Task).assigned_by === authUser.id
    if (!authorized && data.parent_task_id) {
      const { data: parent } = await adminClient.from('tasks').select('user_id').eq('id', data.parent_task_id).single()
      if (parent?.user_id === authUser.id) authorized = true
    }
    if (!authorized) notFound()
  } else if (!authUser) {
    notFound()
  }
  const canChangeStatus = isOwner || isViewerAdmin
  const canReviewDependencies = isOwner || isViewerAdmin

  const childRowsArr = (childRows ?? []) as Array<DependencyChildData & { user_id: string }>
  const childUserIds = Array.from(new Set(childRowsArr.map(c => c.user_id)))
  const { data: assigneeProfiles } = childUserIds.length > 0
    ? await adminClient.from('profiles').select('id, full_name, avatar_url').in('id', childUserIds)
    : { data: [] as { id: string; full_name: string; avatar_url: string | null }[] }
  const profileById: Record<string, { full_name: string; avatar_url: string | null }> =
    Object.fromEntries((assigneeProfiles ?? []).map(p => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]))

  const dependencyChildren: DependencyChildData[] = childRowsArr.map(c => ({
    ...c,
    assignee: profileById[c.user_id] ?? null,
  }))

  const pendingDependencies = dependencyChildren.filter(
    c => !(c.status === 'done' && c.approval_status === 'approved'),
  )
  const hasDependencies = dependencyChildren.length > 0

  // If this task is itself a dependency, fetch the parent task summary for a breadcrumb.
  let parentSummary: { id: string; title: string; status: string; user_id: string; assignee_name: string | null } | null = null
  if (data.parent_task_id) {
    const { data: parent } = await adminClient
      .from('tasks')
      .select('id, title, status, user_id')
      .eq('id', data.parent_task_id)
      .single()
    if (parent) {
      const { data: parentOwner } = await adminClient
        .from('profiles')
        .select('full_name')
        .eq('id', parent.user_id)
        .single()
      parentSummary = { ...parent, assignee_name: parentOwner?.full_name ?? null }
    }
  }

  const pc: Record<string, number> = {}
  const pcLabels: Record<string, string> = {}
  for (const row of pointConfigRows ?? []) {
    pc[row.config_key] = Number(row.config_value)
    pcLabels[row.config_key] = row.label
  }

  // Resolve a display label for a task_type / complexity value, handling deleted weights.
  function resolveLabel(kind: 'task_type' | 'complexity', value: string | null): { label: string; deleted: boolean } | null {
    if (!value) return null
    const key = `${kind}_${value}`
    if (pcLabels[key]) return { label: pcLabels[key], deleted: false }
    // Fallback: raw value, marked as deleted so UI can style it differently
    return { label: value, deleted: true }
  }

  const task = data as Task & { task_updates: TaskUpdate[] }
  const updates = [...(task.task_updates ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const overdue = isOverdue(task.due_date, task.status)

  // Volume bonus context for breakdown UI
  const volumeTiers = volumeTiersFromConfig((pointConfigRows ?? []) as unknown as import('@/types').PointConfig[])
  const totalSubtasks = (task.subtasks ?? []).length
  const completedSubtasks = (task.subtasks ?? []).filter(s => s.completed).length
  const potentialTier = volumeTierFor(totalSubtasks, volumeTiers)
  const earnedTier = volumeTierFor(completedSubtasks, volumeTiers)
  const hasIncompleteSubtasks = !isViewerAdmin && totalSubtasks > 0 && completedSubtasks < totalSubtasks
  const showStatusSection = task.status !== 'done' && task.approval_status !== 'pending_approval' && canChangeStatus

  return (
    <div className={cn('mx-auto space-y-5', hasDependencies ? 'max-w-5xl' : 'max-w-3xl')}>
      <Link href="/tasks" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={16} /> Back to Tasks
      </Link>

      {parentSummary && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <LinkIcon size={14} className="text-purple-600 flex-shrink-0" />
            <span className="text-xs font-semibold text-purple-800 uppercase tracking-wide">Dependency of</span>
            <Link href={`/tasks/${parentSummary.id}`} className="text-sm font-semibold text-purple-900 hover:underline truncate">
              {parentSummary.title}
            </Link>
            {parentSummary.assignee_name && (
              <span className="text-xs text-purple-700">· owned by {parentSummary.assignee_name}</span>
            )}
          </div>
          <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide', statusStyles[parentSummary.status])}>
            {statusLabels[parentSummary.status] ?? parentSummary.status}
          </span>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-bold text-gray-900 leading-snug">{task.title}</h1>
          <div className="flex items-center gap-2 flex-shrink-0">
            <PrioritySelect
              taskId={task.id}
              priority={task.priority}
              disabled={task.approval_status === 'pending_approval'}
            />
            <span className={cn('text-xs px-2 py-1 rounded-full font-medium', statusStyles[task.status])}>
              {task.status.replace('_', ' ')}
            </span>
            {task.approval_status === 'pending_approval' && (
              <span className="text-xs px-2 py-1 rounded-full font-medium bg-yellow-100 text-yellow-700">
                Score Pending
              </span>
            )}
            {potentialTier.name !== 'standard' && (
              <span
                className={cn(
                  'text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wide flex items-center gap-1',
                  potentialTier.name === 'massive' ? 'bg-amber-100 text-amber-800' :
                  potentialTier.name === 'substantial' ? 'bg-purple-100 text-purple-700' :
                  'bg-blue-100 text-blue-700',
                )}
                title={`${totalSubtasks} subtasks → +${potentialTier.bonus} complexity bonus`}
              >
                ✨ {potentialTier.label} Task
              </span>
            )}
            {task.approval_status !== 'pending_approval' && !(task.status === 'done' && task.approval_status === 'approved') && (
              <Link
                href={`/tasks/${task.id}/edit`}
                className="flex items-center gap-1.5 px-3 py-1 border border-gray-200 text-xs font-medium text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Pencil size={12} /> Edit
              </Link>
            )}
            {isViewerAdmin && (
              existingAward
                ? <span className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">🏅 Awarded</span>
                : <GiveAwardButton userId={task.user_id} userName="" taskId={task.id} taskTitle={task.title} />
            )}
          </div>
        </div>

        {task.description && (
          <p className="text-gray-600 text-sm leading-relaxed">{task.description}</p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-gray-100">
          {task.start_date && (
            <div>
              <p className="text-xs text-gray-400 flex items-center gap-1 mb-1"><CalendarDays size={11} /> Start Date</p>
              <p className="text-sm font-medium text-gray-700">{formatDate(task.start_date)}</p>
            </div>
          )}
          {task.due_date && (
            <div>
              <p className="text-xs text-gray-400 flex items-center gap-1 mb-1"><Clock size={11} /> Due Date</p>
              <p className={cn('text-sm font-medium', overdue ? 'text-red-600' : 'text-gray-700')}>
                {formatDate(task.due_date)}{overdue && ' (Overdue)'}
              </p>
            </div>
          )}
          {task.category && (
            <div>
              <p className="text-xs text-gray-400 flex items-center gap-1 mb-1"><Tag size={11} /> Category</p>
              <p className="text-sm font-medium text-gray-700 capitalize">{task.category}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400 flex items-center gap-1 mb-2"><Zap size={11} /> Score</p>
            {task.score_weight > 0 ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1">
                  {(() => {
                    const typeInfo = resolveLabel('task_type', task.task_type)
                    if (!typeInfo) return null
                    const builtin = task.task_type ? taskTypeLabels[task.task_type] : undefined
                    return (
                      <span className={cn(
                        'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                        typeInfo.deleted ? 'bg-gray-100 text-gray-400 line-through' : 'bg-blue-50 text-blue-700'
                      )}>
                        {builtin ?? typeInfo.label}{typeInfo.deleted ? ' (deleted)' : ''}
                      </span>
                    )
                  })()}
                  {(() => {
                    const complexityInfo = resolveLabel('complexity', task.complexity)
                    if (!complexityInfo) return null
                    const builtin = task.complexity ? complexityLabels[task.complexity] : undefined
                    return (
                      <span className={cn(
                        'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                        complexityInfo.deleted ? 'bg-gray-100 text-gray-400 line-through' : 'bg-purple-50 text-purple-700'
                      )}>
                        {builtin ?? complexityInfo.label}{complexityInfo.deleted ? ' (deleted)' : ''}
                      </span>
                    )
                  })()}
                </div>
                {task.status === 'done' ? (
                  <div className="space-y-0.5">
                    <p className={cn('text-sm font-bold', task.score_earned > task.score_weight ? 'text-green-600' : 'text-gray-800')}>
                      {existingAward
                        ? <>{task.score_earned + (existingAward as { bonus_points: number }).bonus_points} pts total</>
                        : <>{task.score_earned} pts earned</>
                      }
                      {task.score_earned > task.score_weight && (
                        <span className="text-[10px] text-green-500 ml-1 font-medium">✦ early bonus</span>
                      )}
                    </p>
                    {existingAward && (() => {
                      const award = existingAward as unknown as { bonus_points: number; award_types: { name: string; icon: string } | null }
                      return (
                        <div className="text-[10px] text-gray-500 space-y-0.5">
                          <p>{task.score_earned} pts task score</p>
                          <p className="text-amber-600 font-medium">+{award.bonus_points} pts {award.award_types?.icon ?? '🏅'} {award.award_types?.name ?? 'Award'}</p>
                        </div>
                      )
                    })()}
                  </div>
                ) : (
                  <p className="text-sm font-bold text-blue-600">{task.score_weight} pts potential</p>
                )}
                {task.status === 'done' && task.due_date && task.completion_date && (() => {
                  const days = Math.round((new Date(task.due_date).getTime() - new Date(task.completion_date).getTime()) / 86400000)
                  if (days > 0) return <p className="text-[10px] text-green-600 font-medium">{days}d early</p>
                  if (days < 0) return <p className="text-[10px] text-red-500 font-medium">{Math.abs(days)}d late</p>
                  return <p className="text-[10px] text-gray-400 font-medium">on time</p>
                })()}
              </div>
            ) : (
              <p className="text-sm text-gray-400">—</p>
            )}
          </div>
          {task.completion_date && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Completed</p>
              <p className="text-sm font-medium text-green-600">{formatDate(task.completion_date)}</p>
            </div>
          )}
        </div>

        {/* Score Breakdown */}
        {task.score_weight > 0 && (() => {
          const typeKey = task.task_type ? `task_type_${task.task_type}` : null
          const compKey = task.complexity ? `complexity_${task.complexity}` : null
          const typeW = typeKey ? pc[typeKey] : undefined
          const compW = compKey ? pc[compKey] : undefined
          const typeDeleted = !!task.task_type && typeW === undefined
          const compDeleted = !!task.complexity && compW === undefined
          const base = 10
          const potential = task.score_weight
          const beforeMult = pc['deadline_before_multiplier'] ?? 1.5
          const onMult = pc['deadline_on_multiplier'] ?? 1.0
          const latePenalty = pc['deadline_after_penalty_per_day'] ?? 0.1
          const days = task.due_date && task.completion_date
            ? Math.round((new Date(task.due_date).getTime() - new Date(task.completion_date).getTime()) / 86400000)
            : null
          const isClassified = !!task.task_type && !!task.complexity

          // Display label: strip leading emoji from hardcoded label, fall back to
          // point_config label, then to the raw task_type/complexity string.
          const stripEmoji = (s: string) => s.includes(' ') ? s.replace(/^\S+\s/, '') : s
          const typeLabel = task.task_type
            ? (taskTypeLabels[task.task_type] ? stripEmoji(taskTypeLabels[task.task_type]) : (pcLabels[`task_type_${task.task_type}`] ?? task.task_type))
            : ''
          const compLabel = task.complexity
            ? (complexityLabels[task.complexity] ? stripEmoji(complexityLabels[task.complexity]) : (pcLabels[`complexity_${task.complexity}`] ?? task.complexity))
            : ''

          return (
            <div className="pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Zap size={11} /> Score Breakdown
              </p>
              <div className="bg-gray-50 rounded-xl p-4 space-y-3 text-sm">
                {/* Potential calculation */}
                {isClassified ? (
                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Potential Score</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-white border border-gray-200 text-gray-700 font-mono text-xs">Base: {base}</span>
                      <span className="text-gray-300 text-xs">×</span>
                      <span className={cn(
                        'px-2 py-0.5 rounded-md font-mono text-xs border',
                        typeDeleted ? 'bg-gray-100 border-gray-200 text-gray-400 line-through' : 'bg-blue-50 border-blue-100 text-blue-700'
                      )}>
                        {typeLabel} ×{typeW ?? '?'}
                      </span>
                      <span className="text-gray-300 text-xs">×</span>
                      <span className={cn(
                        'px-2 py-0.5 rounded-md font-mono text-xs border',
                        compDeleted ? 'bg-gray-100 border-gray-200 text-gray-400 line-through' : 'bg-purple-50 border-purple-100 text-purple-700'
                      )}>
                        ({compLabel} ×{compW ?? '?'}{potentialTier.bonus > 0 ? ` + ${potentialTier.bonus}` : ''})
                      </span>
                      <span className="text-gray-300 text-xs">=</span>
                      <span className="px-2 py-0.5 rounded-md bg-white border border-gray-300 text-gray-900 font-bold font-mono text-xs">{potential} pts</span>
                    </div>
                    {potentialTier.bonus > 0 && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1">
                        ✨ <span className="font-semibold">{potentialTier.label}</span> task — {totalSubtasks} subtasks adds <span className="font-mono font-semibold">+{potentialTier.bonus}</span> to complexity weight.
                        {task.status === 'done' && earnedTier.bonus !== potentialTier.bonus && (
                          <span className="block text-[10px] text-amber-700 mt-0.5">
                            Earned bonus uses only {completedSubtasks} completed subtasks → tier <span className="font-semibold">{earnedTier.label}</span> (+{earnedTier.bonus}).
                          </span>
                        )}
                      </p>
                    )}
                    {(typeDeleted || compDeleted) && (
                      <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1 mt-1">
                        ⚠ This task was scored with a weight that has since been deleted. The shown score is frozen at the original calculation.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Potential (unclassified default):</span>
                    <span className="px-2 py-0.5 rounded-md bg-white border border-gray-300 text-gray-900 font-bold font-mono text-xs">{potential} pts</span>
                  </div>
                )}

                {/* Earned calculation */}
                {task.status === 'done' && (
                  <div className="space-y-1.5 pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Earned Score</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-white border border-gray-200 text-gray-700 font-mono text-xs">{potential} pts</span>
                      <span className="text-gray-300 text-xs">×</span>
                      {days === null ? (
                        <span className="px-2 py-0.5 rounded-md bg-gray-50 border border-gray-200 text-gray-600 font-mono text-xs">×{onMult} (on time)</span>
                      ) : days > 0 ? (
                        <span className="px-2 py-0.5 rounded-md bg-green-50 border border-green-100 text-green-700 font-mono text-xs">×{beforeMult} ({days}d early bonus)</span>
                      ) : days === 0 ? (
                        <span className="px-2 py-0.5 rounded-md bg-gray-50 border border-gray-200 text-gray-600 font-mono text-xs">×{onMult} (on time)</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-red-50 border border-red-100 text-red-600 font-mono text-xs">− {latePenalty}×{Math.abs(days)}d late = −{Math.round(latePenalty * Math.abs(days) * 100) / 100}</span>
                      )}
                      <span className="text-gray-300 text-xs">=</span>
                      <span className={cn('px-2 py-0.5 rounded-md border font-bold font-mono text-xs',
                        task.score_earned > potential ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-300 text-gray-900'
                      )}>{task.score_earned} pts</span>
                    </div>

                    {existingAward && (() => {
                      const award = existingAward as unknown as { bonus_points: number; award_types: { name: string; icon: string } | null }
                      const total = task.score_earned + award.bonus_points
                      return (
                        <div className="space-y-1.5 pt-2 border-t border-amber-100">
                          <p className="text-xs text-amber-600 font-medium uppercase tracking-wide">Award Bonus</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-white border border-gray-200 text-gray-700 font-mono text-xs">{task.score_earned} pts</span>
                            <span className="text-gray-300 text-xs">+</span>
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 font-mono text-xs">
                              {award.award_types?.icon ?? '🏅'} {award.bonus_points} pts ({award.award_types?.name ?? 'Award'})
                            </span>
                            <span className="text-gray-300 text-xs">=</span>
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-amber-800 font-bold font-mono text-xs">{total} pts total</span>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* Not done: show what they could earn */}
                {task.status !== 'done' && (
                  <div className="pt-2 border-t border-gray-200 text-xs text-gray-500 space-y-0.5">
                    <p>Complete early → <span className="font-semibold text-green-600">{Math.round(potential * beforeMult * 100) / 100} pts</span> (+{Math.round((beforeMult - 1) * 100)}% bonus)</p>
                    <p>Complete on time → <span className="font-semibold text-gray-700">{Math.round(potential * onMult * 100) / 100} pts</span></p>
                    <p>Each day late → <span className="font-semibold text-red-500">−{latePenalty} pts/day</span></p>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* Subtasks checklist + Status Update (shared client state so blockDone updates reactively) */}
        <TaskSubtasksStatusSection
          taskId={task.id}
          initialSubtasks={task.subtasks ?? []}
          isAdmin={isViewerAdmin}
          currentStatus={task.status}
          showStatusSection={showStatusSection}
          pendingDepsCount={pendingDependencies.length}
        />
        {task.approval_status === 'pending_approval' && (
          <div className="pt-4 border-t border-gray-100 bg-yellow-50 rounded-lg px-4 py-3">
            {parentSummary ? (
              <>
                <p className="text-sm text-yellow-800 font-medium">⏳ Awaiting approval from task owner</p>
                <p className="text-xs text-yellow-600 mt-0.5">
                  {parentSummary.assignee_name
                    ? `${parentSummary.assignee_name} needs to review and approve this task.`
                    : 'The main task owner needs to review and approve this task.'}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-yellow-800 font-medium">⏳ Awaiting score approval</p>
                <p className="text-xs text-yellow-600 mt-0.5">This task is marked done and pending score confirmation.</p>
              </>
            )}
          </div>
        )}
        {task.status !== 'done' && task.approval_status !== 'pending_approval' && !canChangeStatus && (
          <div className="pt-4 border-t border-gray-100 bg-gray-50 rounded-lg px-4 py-3">
            <p className="text-sm text-gray-700 font-medium">Status is controlled by the assignee</p>
            <p className="text-xs text-gray-500 mt-0.5">Only the assigned user can move this task through its status. You will be notified to approve once it is marked done.</p>
          </div>
        )}
      </div>

      {/* Dependency Dashboard */}
      {hasDependencies && (
        <DependencyDashboard children={dependencyChildren} canReview={canReviewDependencies} />
      )}

      {/* Update History */}
      {updates.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Update History</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {updates.length} {updates.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          <ol className="divide-y divide-gray-100">
            {updates.map(update => {
              const isNoteOnly = update.old_status === update.new_status
              const fromStatus = update.old_status ?? 'todo'
              const toStatus = update.new_status

              return (
                <li
                  key={update.id}
                  className={cn(
                    'px-6 py-4 flex gap-4 items-start',
                    isNoteOnly ? 'border-l-4 border-amber-300' : 'border-l-4 border-blue-400'
                  )}
                >
                  {/* Icon */}
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                    isNoteOnly ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-500'
                  )}>
                    {isNoteOnly
                      ? <StickyNote size={15} />
                      : <RefreshCw size={15} />
                    }
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 min-w-0">
                        {/* Entry type label */}
                        <p className="text-sm font-semibold text-gray-800">
                          {isNoteOnly ? 'Note Added' : 'Status Update'}
                        </p>

                        {/* Status transition */}
                        {!isNoteOnly && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn('text-xs px-2.5 py-0.5 rounded-full font-medium', statusStyles[fromStatus] ?? 'bg-gray-100 text-gray-600')}>
                              {statusLabels[fromStatus] ?? fromStatus}
                            </span>
                            <ArrowRight size={13} className="text-gray-400 flex-shrink-0" />
                            <span className={cn('text-xs px-2.5 py-0.5 rounded-full font-medium', statusStyles[toStatus] ?? 'bg-gray-100 text-gray-600')}>
                              {statusLabels[toStatus] ?? toStatus}
                            </span>
                          </div>
                        )}

                        {/* Note text */}
                        {update.note && (
                          <blockquote className="mt-1 text-sm text-gray-600 bg-gray-50 border-l-2 border-gray-300 pl-3 py-1.5 pr-2 rounded-r-lg italic leading-relaxed">
                            {update.note}
                          </blockquote>
                        )}
                      </div>

                      {/* Timestamp */}
                      <time className="text-xs text-gray-400 flex-shrink-0 mt-0.5 text-right whitespace-nowrap">
                        {formatUpdateTime(update.created_at)}
                      </time>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </div>
  )
}
