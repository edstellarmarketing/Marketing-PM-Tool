'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Trophy, ArrowRight, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import AnnouncementCard from './AnnouncementCard'
import type { AnnouncementRow } from './types'

interface Props {
  announcements: AnnouncementRow[]
  dept: string | null
}

const AUTO_ROTATE_MS = 6500

export default function DashboardAnnouncementsCarousel({ announcements, dept }: Props) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Reset index if the list shrinks below current index
  useEffect(() => {
    if (index >= announcements.length) setIndex(0)
  }, [announcements.length, index])

  // Auto-rotate (paused on hover, or when there's only one card)
  useEffect(() => {
    if (paused || announcements.length <= 1) return
    const t = setInterval(() => {
      setIndex(i => (i + 1) % announcements.length)
    }, AUTO_ROTATE_MS)
    return () => clearInterval(t)
  }, [paused, announcements.length])

  if (announcements.length === 0) return null

  const current = announcements[index]
  const showNav = announcements.length > 1

  return (
    <section
      ref={containerRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative overflow-hidden bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-100 dark:from-amber-950/40 dark:via-yellow-950/30 dark:to-amber-950/50 border border-amber-200 dark:border-amber-900/40 rounded-xl p-4"
    >
      {/* Decorative sparkle to draw the eye */}
      <Sparkles
        aria-hidden
        size={64}
        className="absolute -right-4 -top-4 text-amber-300/40 dark:text-amber-700/30 pointer-events-none"
      />

      <div className="flex items-start justify-between gap-3 mb-3 relative">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="flex-shrink-0 mt-0.5 inline-flex items-center justify-center w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm">
            <Trophy size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-bold text-amber-900 dark:text-amber-100 leading-tight">
              Earn Bonus Points and Awards by Accepting Challenges
            </h2>
            <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mt-0.5">
              {announcements.length} open challenge{announcements.length === 1 ? '' : 's'} waiting for you
              {dept ? <> in <span className="font-semibold">{dept}</span></> : ''}
              {' '}— pick one and stack extra points on your monthly score.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {showNav && (
            <span className="text-[11px] text-amber-700 dark:text-amber-300 whitespace-nowrap">
              {index + 1} / {announcements.length}
            </span>
          )}
          <Link
            href="/announcements"
            className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:underline whitespace-nowrap"
          >
            See all <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      <div className="relative">
        {showNav && (
          <>
            <button
              type="button"
              onClick={() => setIndex(i => (i - 1 + announcements.length) % announcements.length)}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-10 p-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              aria-label="Previous"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setIndex(i => (i + 1) % announcements.length)}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 z-10 p-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              aria-label="Next"
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}

        <div key={current.id} className="px-1">
          <AnnouncementCard announcement={current} variant="compact" />
        </div>
      </div>

      {showNav && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {announcements.map((a, i) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Go to announcement ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === index
                  ? 'w-6 bg-amber-500'
                  : 'w-1.5 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400 dark:hover:bg-gray-600'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  )
}
