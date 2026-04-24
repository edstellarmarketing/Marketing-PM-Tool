'use client'

import { useMemo } from 'react'
import { Link as LinkIcon, CheckCircle2, Clock, Hourglass, Zap, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import DependencyAccordion, { type DependencyChildData } from './DependencyAccordion'

interface Props {
  children: DependencyChildData[]
  canReview: boolean
}

type DashboardState = {
  label: string
  description: string
  badgeCls: string
  Icon: typeof CheckCircle2
}

export default function DependencyDashboard({ children, canReview }: Props) {
  const stats = useMemo(() => {
    const total = children.length
    const approved = children.filter(c => c.status === 'done' && c.approval_status === 'approved').length
    const pendingApproval = children.filter(c => c.status === 'done' && c.approval_status === 'pending_approval').length
    const inProgress = children.filter(c => c.status !== 'done').length
    const totalPotential = children.reduce((s, c) => s + (c.score_weight ?? 0), 0)
    const totalEarned = children.reduce((s, c) => s + (c.score_earned ?? 0), 0)
    const uniqueAssignees = new Set(children.map(c => c.user_id)).size
    const percentComplete = total === 0 ? 0 : Math.round((approved / total) * 100)
    return { total, approved, pendingApproval, inProgress, totalPotential, totalEarned, uniqueAssignees, percentComplete }
  }, [children])

  const state: DashboardState = useMemo(() => {
    if (stats.total === stats.approved) {
      return {
        label: 'Ready to complete',
        description: 'All dependencies are done and approved. You can mark the main task as done.',
        badgeCls: 'bg-green-100 text-green-800',
        Icon: CheckCircle2,
      }
    }
    if (stats.pendingApproval > 0 && stats.inProgress === 0) {
      return {
        label: `${stats.pendingApproval} awaiting your approval`,
        description: canReview
          ? 'Dependencies are done. Approve them below to unlock the main task.'
          : 'Dependencies are done and waiting for the main task owner to approve them.',
        badgeCls: 'bg-yellow-100 text-yellow-800',
        Icon: Hourglass,
      }
    }
    if (stats.pendingApproval > 0 && stats.inProgress > 0) {
      return {
        label: 'Dependencies in progress',
        description: `${stats.inProgress} still in progress, ${stats.pendingApproval} awaiting your approval.`,
        badgeCls: 'bg-amber-100 text-amber-800',
        Icon: Hourglass,
      }
    }
    return {
      label: 'Dependencies in progress',
      description: `${stats.inProgress} of ${stats.total} dependencies still in progress.`,
      badgeCls: 'bg-blue-100 text-blue-800',
      Icon: Clock,
    }
  }, [stats, canReview])

  const sorted = useMemo(() => {
    // Pending approvals first, then in progress / overdue, then approved
    const order = (c: DependencyChildData) => {
      if (c.status === 'done' && c.approval_status === 'pending_approval') return 0
      if (c.status === 'done' && c.approval_status === 'approved') return 2
      return 1
    }
    return [...children].sort((a, b) => order(a) - order(b))
  }, [children])

  return (
    <div className="bg-gradient-to-br from-purple-50/60 via-white to-blue-50/40 border border-purple-100 rounded-2xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center">
            <LinkIcon size={17} className="text-purple-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Dependency Dashboard</h2>
            <p className="text-xs text-gray-500">{stats.total} linked dependency {stats.total === 1 ? 'task' : 'tasks'}</p>
          </div>
        </div>
        <span
          title={state.description}
          className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold', state.badgeCls)}
        >
          <state.Icon size={12} /> {state.label}
        </span>
      </div>

      {/* Status explanation */}
      <p className="text-xs text-gray-600 bg-white border border-gray-100 rounded-lg px-3 py-2">
        {state.description}
      </p>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-semibold text-gray-700">Progress</span>
          <span className="text-gray-500">
            <span className="font-bold text-gray-900">{stats.approved}</span> of {stats.total} approved · {stats.percentComplete}%
          </span>
        </div>
        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-500',
              stats.percentComplete === 100 ? 'bg-green-500' : 'bg-blue-500',
            )}
            style={{ width: `${stats.percentComplete}%` }}
            role="progressbar"
            aria-valuenow={stats.percentComplete}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-gray-500 mt-2">
          {stats.pendingApproval > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" /> {stats.pendingApproval} awaiting your approval
            </span>
          )}
          {stats.inProgress > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> {stats.inProgress} in progress
            </span>
          )}
          {stats.approved > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> {stats.approved} approved
            </span>
          )}
        </div>
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 px-3 py-2.5">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Aggregate Score</p>
          <p className="text-sm font-bold text-gray-900 mt-0.5 flex items-center gap-1">
            <Zap size={12} className="text-blue-500" />
            {stats.totalEarned} <span className="text-gray-400 font-normal">/ {stats.totalPotential} pts</span>
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 px-3 py-2.5">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Assignees</p>
          <p className="text-sm font-bold text-gray-900 mt-0.5 flex items-center gap-1">
            <Users size={12} className="text-purple-500" />
            {stats.uniqueAssignees} {stats.uniqueAssignees === 1 ? 'person' : 'people'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 px-3 py-2.5">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Approval Status</p>
          <p className="text-sm font-bold text-gray-900 mt-0.5">
            {stats.approved}/{stats.total} ready
          </p>
        </div>
      </div>

      {/* Accordion list */}
      <div className="space-y-2.5">
        {sorted.map(child => (
          <DependencyAccordion key={child.id} child={child} canReview={canReview} />
        ))}
      </div>
    </div>
  )
}
