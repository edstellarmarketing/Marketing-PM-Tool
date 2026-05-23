'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AnnouncementCard from './AnnouncementCard'
import type { AnnouncementRow } from './types'

interface Props {
  open: AnnouncementRow[]
  accepted: AnnouncementRow[]
}

export default function MemberAnnouncementsList({ open, accepted }: Props) {
  const router = useRouter()
  const [optimisticallyAccepted, setOptimisticallyAccepted] = useState<Set<string>>(new Set())

  const visibleOpen = open.filter(a => !optimisticallyAccepted.has(a.id))

  function handleAccepted(annId: string) {
    setOptimisticallyAccepted(prev => new Set([...prev, annId]))
    // Re-fetch server data so the row shows up in "My accepted"
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Open ({visibleOpen.length})
        </h2>
        {visibleOpen.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
            No announcements for your department right now.
          </p>
        ) : (
          <div className="space-y-3">
            {visibleOpen.map(a => (
              <AnnouncementCard
                key={a.id}
                announcement={a}
                variant="full"
                onAccepted={() => handleAccepted(a.id)}
              />
            ))}
          </div>
        )}
      </section>

      {accepted.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            My accepted ({accepted.length})
          </h2>
          <div className="space-y-3">
            {accepted.map(a => (
              <AnnouncementCard
                key={a.id}
                announcement={a}
                variant="full"
                showAcceptedState
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
