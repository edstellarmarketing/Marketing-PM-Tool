'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import GoalCard from '@/components/plans/GoalCard'
import type { Goal } from '@/types'

interface PendingGoal {
  planId: string
  userId: string
  userName: string
  month: number
  year: number
  goal: Goal
}

interface Props {
  pending: PendingGoal[]
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function PendingGoalApprovalsPanel({ pending: initialPending }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState(initialPending)
  const [error, setError] = useState<string | null>(null)

  async function handleGoalAction(planId: string, goalId: string, action: 'submit' | 'approve' | 'reject', note?: string) {
    setError(null)
    const res = await fetch(`/api/plans/${planId}/goals/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, approval_note: note }),
    })
    if (!res.ok) {
      const data = await res.json()
      setError(typeof data.error === 'string' ? data.error : 'Failed to update goal')
      return
    }
    // Remove from pending list on approve/reject
    if (action === 'approve' || action === 'reject') {
      setPending(prev => prev.filter(pg => !(pg.planId === planId && pg.goal.id === goalId)))
    }
    router.refresh()
  }

  if (pending.length === 0) {
    return <p className="text-sm text-gray-400">No checklist goals awaiting approval.</p>
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}
      {pending.map(({ planId, userName, month, year, goal }) => (
        <div key={goal.id}>
          <p className="text-xs text-gray-500 font-medium mb-1 pl-1">
            {userName} · {MONTH_NAMES[month - 1]} {year}
          </p>
          <GoalCard
            goal={goal}
            linkedTaskCount={0}
            completedTaskCount={0}
            isAdmin
            onGoalAction={(goalId, action, note) => handleGoalAction(planId, goalId, action, note)}
          />
        </div>
      ))}
    </div>
  )
}
