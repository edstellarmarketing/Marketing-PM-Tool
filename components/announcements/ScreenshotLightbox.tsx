'use client'

import { useEffect } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

export interface LightboxImage {
  url: string
  alt: string
}

interface Props {
  images: LightboxImage[]
  index: number
  onClose: () => void
  onIndexChange: (next: number) => void
}

export default function ScreenshotLightbox({ images, index, onClose, onIndexChange }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onIndexChange((index - 1 + images.length) % images.length)
      else if (e.key === 'ArrowRight') onIndexChange((index + 1) % images.length)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, images.length, onClose, onIndexChange])

  if (images.length === 0 || !images[index]) return null
  const current = images[index]

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
        aria-label="Close"
      >
        <X size={20} />
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onIndexChange((index - 1 + images.length) % images.length) }}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Previous"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onIndexChange((index + 1) % images.length) }}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Next"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.alt}
          className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg shadow-2xl bg-gray-900"
        />
        <p className="text-xs text-white/80">
          {index + 1} / {images.length} · {current.alt}
        </p>
      </div>
    </div>
  )
}
