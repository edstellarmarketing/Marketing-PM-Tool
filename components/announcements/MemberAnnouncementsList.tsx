'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AnnouncementCard from './AnnouncementCard'
import type { AnnouncementRow } from './types'

const INITIAL_VISIBLE = 10

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
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <ToggleSection
        title="Open"
        items={visibleOpen}
        emptyLabel="No announcements for your department right now."
        olderLabel="open"
        renderItem={a => (
          <AnnouncementCard
            key={a.id}
            announcement={a}
            variant="full"
            onAccepted={() => handleAccepted(a.id)}
          />
        )}
      />

      {accepted.length > 0 && (
        <ToggleSection
          title="My accepted"
          items={accepted}
          olderLabel="accepted"
          renderItem={a => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              variant="full"
              showAcceptedState
            />
          )}
        />
      )}
    </div>
  )
}

interface ToggleSectionProps {
  title: string
  items: AnnouncementRow[]
  renderItem: (a: AnnouncementRow) => React.ReactNode
  /** Word for the "N older X hidden" hint. */
  olderLabel: string
  /** If provided and the list is empty, render this instead of nothing. */
  emptyLabel?: string
}

function ToggleSection({ title, items, renderItem, olderLabel, emptyLabel }: ToggleSectionProps) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? items : items.slice(0, INITIAL_VISIBLE)
  const hiddenCount = items.length - INITIAL_VISIBLE
  const canCollapse = items.length > INITIAL_VISIBLE

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {title} ({items.length})
        </h2>
        {canCollapse && (
          <button
            type="button"
            onClick={() => setShowAll(s => !s)}
            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {showAll ? `Show recent ${INITIAL_VISIBLE}` : `Show all (${items.length})`}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        emptyLabel && (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
            {emptyLabel}
          </p>
        )
      ) : (
        <>
          <div className="space-y-3">
            {visible.map(renderItem)}
          </div>
          {!showAll && hiddenCount > 0 && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center">
              {hiddenCount} older {olderLabel} announcement{hiddenCount === 1 ? '' : 's'} hidden — click <em>Show all</em> above to see them.
            </p>
          )}
        </>
      )}
    </section>
  )
}
