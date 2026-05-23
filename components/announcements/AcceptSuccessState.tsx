'use client'

import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'

interface Props {
  taskId: string
  totalPoints: number
  awardIcon?: string | null
  awardName?: string | null
  bonusPoints: number
  /** Where the secondary "Back" button takes the user. */
  backHref: string
  backLabel?: string
}

export default function AcceptSuccessState({
  taskId, totalPoints, awardIcon, awardName, bonusPoints, backHref, backLabel = 'Back to announcements',
}: Props) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 text-center max-w-md mx-auto">
      <div className="mx-auto mb-3 inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 size={32} />
      </div>
      <h2 className="text-lg font-bold text-gray-900 dark:text-white">
        Task created — go earn {totalPoints} pts!
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
        It&apos;s now on your task list.
        {awardName && (
          <>
            {' '}
            <span aria-hidden>{awardIcon}</span>{' '}
            <strong>{awardName}</strong>
            {bonusPoints > 0 && <> + {bonusPoints} bonus pts</>} will be granted when an admin approves the completed task.
          </>
        )}
      </p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <Link
          href={`/tasks/${taskId}`}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Open task →
        </Link>
        <Link
          href={backHref}
          className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          {backLabel}
        </Link>
      </div>
    </div>
  )
}
