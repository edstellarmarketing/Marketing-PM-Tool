'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'

interface Award {
  id: string
  bonus_points: number
  month: number
  year: number
  note: string | null
  task_id: string | null
  award_types: { name: string; icon: string } | null
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

interface Props {
  awards: Award[]
  userId: string
}

export default function UserAwardsList({ awards: initial, userId }: Props) {
  const [awards, setAwards] = useState(initial)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function deleteAward(id: string) {
    setDeleting(id)
    const res = await fetch(`/api/admin/awards/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setAwards(prev => prev.filter(a => a.id !== id))
    }
    setDeleting(null)
  }

  if (awards.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-10">No awards</p>
  }

  return (
    <div className="divide-y divide-gray-100">
      {awards.map(award => {
        const at = award.award_types
        const orphaned = award.task_id === null
        return (
          <div key={award.id} className="flex items-start gap-3 px-5 py-4">
            <span className="text-2xl flex-shrink-0">{at?.icon ?? '🏅'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm text-gray-900">{at?.name ?? 'Award'}</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">+{award.bonus_points} pts</span>
                <span className="text-xs text-gray-400">{MONTHS[award.month - 1]} {award.year}</span>
                {orphaned && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                    no linked task
                  </span>
                )}
              </div>
              {award.note && <p className="text-xs text-gray-600 mt-1 italic">"{award.note}"</p>}
            </div>
            <button
              onClick={() => deleteAward(award.id)}
              disabled={deleting === award.id}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 flex-shrink-0"
              title="Delete award and remove its bonus points from monthly score"
            >
              {deleting === award.id
                ? <span className="w-4 h-4 border border-red-400 border-t-transparent rounded-full animate-spin inline-block" />
                : <Trash2 size={15} />}
            </button>
          </div>
        )
      })}
    </div>
  )
}
