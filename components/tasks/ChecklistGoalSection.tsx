'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import GoalCard from '@/components/plans/GoalCard'
import type { Goal, ChecklistItem, ChecklistItemStatus } from '@/types'

interface PlanGoal {
  planId: string
  month: number
  year: number
  goal: Goal
}

interface Props {
  planGoals: PlanGoal[]
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function ChecklistGoalSection({ planGoals }: Props) {
  const router = useRouter()
  const [goals, setGoals] = useState(planGoals)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleGoalAction(planId: string, goalId: string, action: 'submit' | 'approve' | 'reject', note?: string) {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/plans/${planId}/goals/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, approval_note: note }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json()
      setError(typeof data.error === 'string' ? data.error : 'Failed to update goal')
      return
    }
    const saved = await res.json()
    const updatedGoalMap: Record<string, Goal> = {}
    for (const g of (saved.goals ?? [])) updatedGoalMap[g.id] = g

    setGoals(prev => prev.map(pg =>
      pg.planId === planId && updatedGoalMap[pg.goal.id]
        ? { ...pg, goal: updatedGoalMap[pg.goal.id] }
        : pg
    ))
    router.refresh()
  }

  async function handleChecklistEdit(planId: string, goalId: string, checklist: ChecklistItem[]) {
    const done = checklist.filter(i => i.status === 'done').length
    const progress = checklist.length > 0 ? Math.round((done / checklist.length) * 100) : 0
    const updatedGoal = { ...goals.find(pg => pg.planId === planId && pg.goal.id === goalId)!.goal, checklist, progress }

    setGoals(prev => prev.map(pg =>
      pg.planId === planId && pg.goal.id === goalId ? { ...pg, goal: updatedGoal } : pg
    ))

    const allForPlan = goals
      .filter(pg => pg.planId === planId)
      .map(pg => pg.goal.id === goalId ? updatedGoal : pg.goal)

    setSaving(true)
    const res = await fetch(`/api/plans/${planId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goals: allForPlan }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json()
      setError(typeof data.error === 'string' ? data.error : 'Failed to save')
    }
  }

  async function handleChecklistUpdate(planId: string, goalId: string, itemId: string, status: ChecklistItemStatus) {
    const entry = goals.find(pg => pg.planId === planId && pg.goal.id === goalId)
    if (!entry) return
    const updatedChecklist = (entry.goal.checklist ?? []).map(item =>
      item.id === itemId ? { ...item, status } : item
    )
    const done = updatedChecklist.filter(i => i.status === 'done').length
    const progress = Math.round((done / updatedChecklist.length) * 100)
    const updatedGoal = { ...entry.goal, checklist: updatedChecklist, progress }

    setGoals(prev => prev.map(pg =>
      pg.planId === planId && pg.goal.id === goalId ? { ...pg, goal: updatedGoal } : pg
    ))

    // Persist via full plan goals update
    const allForPlan = goals
      .filter(pg => pg.planId === planId)
      .map(pg => pg.planId === planId && pg.goal.id === goalId ? updatedGoal : pg.goal)

    setSaving(true)
    const res = await fetch(`/api/plans/${planId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goals: allForPlan }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json()
      setError(typeof data.error === 'string' ? data.error : 'Failed to save')
    }
  }

  if (goals.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Checklist Goals</h2>
        {saving && <span className="text-xs text-blue-600 font-medium animate-pulse">Saving…</span>}
      </div>
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}
      <div className="space-y-3">
        {goals.map(({ planId, month, year, goal }) => (
          <div key={goal.id}>
            <p className="text-xs text-gray-400 font-medium mb-1 pl-1">
              {MONTH_NAMES[month - 1]} {year}
            </p>
            <GoalCard
              goal={goal}
              linkedTaskCount={0}
              completedTaskCount={0}
              onChecklistUpdate={(goalId, itemId, status) =>
                handleChecklistUpdate(planId, goalId, itemId, status)
              }
              onGoalAction={(goalId, action, note) =>
                handleGoalAction(planId, goalId, action, note)
              }
              onChecklistEdit={(goalId, checklist) =>
                handleChecklistEdit(planId, goalId, checklist)
              }
            />
          </div>
        ))}
      </div>
    </div>
  )
}
