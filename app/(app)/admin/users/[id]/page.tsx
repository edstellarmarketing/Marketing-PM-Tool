import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus } from 'lucide-react'
import ScoreOverrideRow from '@/components/admin/ScoreOverrideRow'
import UserAccountActions from '@/components/admin/UserAccountActions'
import GiveAwardButton from '@/components/admin/GiveAwardButton'
import RecalculateScoresButton from '@/components/admin/RecalculateScoresButton'
import UserAwardsList from '@/components/admin/UserAwardsList'
import { removeUserAccount, updateUserAccountStatus } from './actions'
import { formatDate, cn } from '@/lib/utils'
import type { Profile, Task, MonthlyPlan, MonthlyScore, UserAward } from '@/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const statusStyles: Record<string, string> = {
  todo:        'bg-gray-100 text-gray-500',
  in_progress: 'bg-blue-100 text-blue-700',
  review:      'bg-yellow-100 text-yellow-700',
  done:        'bg-green-100 text-green-700',
  blocked:     'bg-red-100 text-red-700',
}

const approvalStyles: Record<string, string> = {
  draft:            'bg-gray-100 text-gray-500',
  pending_approval: 'bg-yellow-100 text-yellow-700',
  approved:         'bg-green-100 text-green-700',
  rejected:         'bg-red-100 text-red-700',
}

const approvalLabels: Record<string, string> = {
  draft: 'Draft', pending_approval: 'Awaiting Approval', approved: 'Approved', rejected: 'Rejected',
}

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default async function AdminUserPage({ params, searchParams }: Props) {
  const { id } = await params
  const { tab = 'tasks' } = await searchParams

  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  if (adminProfile?.role !== 'admin') redirect('/dashboard')

  const [{ data: profile }, { data: tasks }, { data: plans }, { data: scores }, { data: userAwardsRaw }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).single(),
    supabase.from('tasks').select('*').eq('user_id', id).order('created_at', { ascending: false }),
    supabase.from('monthly_plans').select('id, month, year').eq('user_id', id).order('year', { ascending: false }).order('month', { ascending: false }),
    supabase.from('monthly_scores').select('*').eq('user_id', id).order('year', { ascending: false }).order('month', { ascending: false }).limit(12),
    adminClient.from('user_awards').select('*, award_types(id,name,icon,bonus_points)').eq('user_id', id).order('created_at', { ascending: false }),
  ])

  if (!profile) notFound()

  const p = profile as Profile
  const isActive = p.is_active !== false
  const isSelf = user!.id === id
  const updateStatusAction = updateUserAccountStatus.bind(null, user!.id, id)
  const removeAccountAction = removeUserAccount.bind(null, user!.id, id)
  const allTasks = (tasks ?? []) as Task[]
  const allPlans = (plans ?? []) as MonthlyPlan[]
  const allScores = (scores ?? []) as MonthlyScore[]
  const userAwards = (userAwardsRaw ?? []) as UserAward[]

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  // Map month+year → score
  const scoreMap: Record<string, MonthlyScore> = {}
  for (const s of allScores) scoreMap[`${s.year}-${s.month}`] = s

  // Tasks grouped by plan_id
  const tasksByPlan: Record<string, Task[]> = {}
  for (const t of allTasks) {
    if (t.plan_id) {
      if (!tasksByPlan[t.plan_id]) tasksByPlan[t.plan_id] = []
      tasksByPlan[t.plan_id].push(t)
    }
  }

  const tabs = [
    { key: 'tasks', label: 'Tasks' },
    { key: 'awards', label: `Awards${userAwards.length > 0 ? ` (${userAwards.length})` : ''}` },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <Link href="/admin" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={16} /> Back to Admin
      </Link>

      {/* Profile header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-start gap-4">
        {p.avatar_url ? (
          <img src={p.avatar_url} alt={p.full_name} className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
            {initials(p.full_name)}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">{p.full_name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
              {p.role}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isActive ? 'active' : 'inactive'}
            </span>
          </div>
          {p.designation && <p className="text-sm font-medium text-gray-700 mt-0.5">{p.designation}</p>}
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
            {p.department && <span>{p.department}</span>}
            {p.joining_date && <span>Joined {formatDate(p.joining_date)}</span>}
          </div>
        </div>
        <RecalculateScoresButton userId={id} />
        <GiveAwardButton
          userId={id}
          userName={p.full_name}
          tasks={allTasks.map(t => ({ id: t.id, title: t.title, status: t.status, due_date: t.due_date }))}
        />
        <Link
          href={`/admin/users/${id}/assign-task`}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} /> Assign Task
        </Link>
        <Link
          href={`/admin/appraisals/${id}`}
          className="px-4 py-2 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          View Appraisal
        </Link>
        {!isSelf && (
          <UserAccountActions
            isActive={isActive}
            updateStatusAction={updateStatusAction}
            removeAccountAction={removeAccountAction}
          />
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <Link
            key={t.key}
            href={`/admin/users/${id}?tab=${t.key}`}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* ── Tasks tab ── */}
      {tab === 'tasks' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">All Tasks ({allTasks.length})</h2>
            <p className="text-xs text-gray-400 mt-0.5">Click the pencil icon to override score weight or earned points</p>
          </div>
          {allTasks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No tasks yet</p>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left py-3 px-4">Task</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Due</th>
                  <th className="text-left py-3 px-4">Weight</th>
                  <th className="text-left py-3 px-4">Earned</th>
                  <th className="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {allTasks.map(task => (
                  <ScoreOverrideRow key={task.id} task={task} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Awards tab ── */}
      {tab === 'awards' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Awards ({userAwards.length})</h2>
              <p className="text-xs text-gray-400 mt-0.5">All bonus awards given to this user</p>
            </div>
            <GiveAwardButton userId={id} userName={p.full_name} />
          </div>
          <UserAwardsList
            userId={id}
            awards={userAwards.map(a => ({
              id: a.id,
              bonus_points: a.bonus_points,
              month: a.month,
              year: a.year,
              note: a.note ?? null,
              task_id: (a as unknown as { task_id: string | null }).task_id ?? null,
              award_types: a.award_types ? { name: a.award_types.name, icon: a.award_types.icon } : null,
            }))}
          />
        </div>
      )}
    </div>
  )
}
