'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const MONTHS_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export interface SpotlightSlide {
  id: string
  bonus_points: number
  month: number
  year: number
  note: string | null
  award_icon: string
  award_name: string
  task_title: string | null
  user_full_name: string
  user_avatar_url: string | null
}

interface Props {
  slides: SpotlightSlide[]
  intervalMs?: number
  totalAwards: number
  recipientCount: number
  monthLabel: string
}

export default function AwardSpotlightCarousel({ slides, intervalMs = 6000, totalAwards, recipientCount, monthLabel }: Props) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const total = slides.length
  const next = useCallback(() => setIndex(i => (i + 1) % total), [total])
  const prev = useCallback(() => setIndex(i => (i - 1 + total) % total), [total])

  useEffect(() => {
    if (paused || total <= 1) return
    timerRef.current = setInterval(() => {
      setIndex(i => (i + 1) % total)
    }, intervalMs)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [paused, total, intervalMs])

  if (total === 0) return null

  const slide = slides[index]
  const firstName = (slide.user_full_name ?? 'Champion').split(' ')[0]
  const initials = (slide.user_full_name ?? '?')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div
      className="bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-6 shadow-sm"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-start justify-between mb-4 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-3xl flex-shrink-0">🏅</span>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-amber-900 leading-tight">
              {recipientCount} {recipientCount === 1 ? 'Person' : 'People'} Awarded This Month
            </h2>
            <p className="text-xs text-amber-700/80 font-medium mt-0.5">
              Award Spotlight · {monthLabel}
            </p>
          </div>
        </div>
        {total > 1 && (
          <span className="text-xs text-amber-700 font-medium tabular-nums flex-shrink-0 mt-1">
            {index + 1} of {total}
          </span>
        )}
      </div>

      <div className="relative">
        {total > 1 && (
          <button
            type="button"
            aria-label="Previous award"
            onClick={prev}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 z-10 w-8 h-8 rounded-full bg-white/90 hover:bg-white border border-amber-200 shadow-sm flex items-center justify-center text-amber-700 hover:text-amber-900 transition"
          >
            ‹
          </button>
        )}

        <div
          key={slide.id}
          className="flex items-center gap-5 bg-white rounded-xl p-5 border border-amber-200 shadow-sm mx-6 animate-[fadeIn_300ms_ease-out]"
        >
          {slide.user_avatar_url ? (
            <img
              src={slide.user_avatar_url}
              alt={slide.user_full_name}
              className="w-16 h-16 rounded-full object-cover ring-4 ring-amber-300 flex-shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-lg font-bold ring-4 ring-amber-300 flex-shrink-0">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-amber-900">
              🎉 Congratulations, {firstName}!
            </p>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="text-lg">{slide.award_icon}</span>
              <span className="text-sm font-semibold text-gray-800">{slide.award_name}</span>
              <span className="text-xs px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full font-bold">
                +{slide.bonus_points} pts
              </span>
              <span className="text-xs text-gray-500">
                · {MONTHS_ABBR[slide.month - 1]} {slide.year}
              </span>
            </div>
            {slide.task_title && (
              <p className="mt-2 text-sm text-gray-800">
                <span className="text-[10px] uppercase tracking-wider text-amber-700 font-bold mr-1.5">Task</span>
                <span className="font-medium">{slide.task_title}</span>
              </p>
            )}
            {slide.note && (
              <p className="mt-2 text-sm text-gray-600 italic leading-relaxed whitespace-pre-line">
                &ldquo;{slide.note}&rdquo;
              </p>
            )}
          </div>
        </div>

        {total > 1 && (
          <button
            type="button"
            aria-label="Next award"
            onClick={next}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 z-10 w-8 h-8 rounded-full bg-white/90 hover:bg-white border border-amber-200 shadow-sm flex items-center justify-center text-amber-700 hover:text-amber-900 transition"
          >
            ›
          </button>
        )}
      </div>

      {total > 1 && (
        <div className="mt-4 flex items-center justify-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Go to award ${i + 1}`}
              onClick={() => setIndex(i)}
              className={
                i === index
                  ? 'w-6 h-2 rounded-full bg-amber-500 transition-all'
                  : 'w-2 h-2 rounded-full bg-amber-200 hover:bg-amber-300 transition-all'
              }
            />
          ))}
        </div>
      )}

      {totalAwards > slides.length && (
        <a
          href="#all-awards"
          className="block text-center text-xs text-blue-700 hover:underline mt-3 font-medium"
        >
          View All Awards ↓
        </a>
      )}

      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  )
}
