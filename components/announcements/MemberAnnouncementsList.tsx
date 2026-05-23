'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Clock, ExternalLink } from 'lucide-react'
import AnnouncementCard from './AnnouncementCard'
import RewardStrip from './RewardStrip'
import type { AnnouncementRow } from './types'

const INITIAL_VISIBLE = 10

interface Props {
  open: AnnouncementRow[]
  requested: AnnouncementRow[]
  approved: AnnouncementRow[]
  taskIdByAnnouncement: Record<string, string | null>
}

export default function MemberAnnouncementsList({ open, requested, approved, taskIdByAnnouncement }: Props) {
  const router = useRouter()
  const [optimisticallyActed, setOptimisticallyActed] = useState<Set<string>>(new Set())

  const visibleOpen = open.filter(a => !optimisticallyActed.has(a.id))

  function handleAccepted(annId: string) {
    setOptimisticallyActed(prev => new Set([...prev, annId]))
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <ToggleSection
        title="Open"
        items={visibleOpen}
        emptyLabel="No announcements for you right now."
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

      {requested.length > 0 && (
        <ToggleSection
          title="Awaiting admin approval"
          items={requested}
          olderLabel="pending"
          renderItem={a => <RequestedCard key={a.id} announcement={a} />}
        />
      )}

      {approved.length > 0 && (
        <ToggleSection
          title="My approved"
          items={approved}
          olderLabel="approved"
          renderItem={a => (
            <ApprovedCard
              key={a.id}
              announcement={a}
              taskId={taskIdByAnnouncement[a.id] ?? null}
            />
          )}
        />
      )}
    </div>
  )
}

function RequestedCard({ announcement }: { announcement: AnnouncementRow }) {
  const award = announcement.award_types ?? null
  const taskPoints = announcement.score_weight ?? 0
  return (
    <article className="bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-900/40 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white break-words">{announcement.title}</h3>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          <Clock size={11} /> Pending admin approval
        </span>
      </div>
      {announcement.description && (
        <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line break-words">{announcement.description}</p>
      )}
      <RewardStrip
        awardIcon={award?.icon ?? null}
        awardName={award?.name ?? null}
        taskPoints={taskPoints}
        bonusPoints={announcement.bonus_points}
        variant="slim"
        showAnimation={false}
      />
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        You requested to accept this. The admin will approve finalists; if approved, the task will appear on your list.
      </p>
    </article>
  )
}

function ApprovedCard({ announcement, taskId }: { announcement: AnnouncementRow; taskId: string | null }) {
  const award = announcement.award_types ?? null
  const taskPoints = announcement.score_weight ?? 0
  return (
    <article className="bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-900/40 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white break-words">{announcement.title}</h3>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          ✓ Approved
        </span>
      </div>
      <RewardStrip
        awardIcon={award?.icon ?? null}
        awardName={award?.name ?? null}
        taskPoints={taskPoints}
        bonusPoints={announcement.bonus_points}
        variant="slim"
        showAnimation={false}
      />
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Bonus is split equally among everyone the admin approves on this announcement.
      </p>
      {taskId && (
        <div className="pt-1">
          <Link
            href={`/tasks/${taskId}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Open task <ExternalLink size={12} />
          </Link>
        </div>
      )}
    </article>
  )
}

interface ToggleSectionProps {
  title: string
  items: AnnouncementRow[]
  renderItem: (a: AnnouncementRow) => React.ReactNode
  olderLabel: string
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
