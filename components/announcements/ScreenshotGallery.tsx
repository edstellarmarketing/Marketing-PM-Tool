'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import ScreenshotLightbox from './ScreenshotLightbox'

export interface GalleryItem {
  id: string
  file_name: string
  viewUrl: string | null
}

interface Props {
  items: GalleryItem[]
  /** Optional title above the strip. */
  title?: string
  /** If provided, shows a × button on hover for each thumb. */
  onDelete?: (item: GalleryItem) => void
  /** Pre-empt the delete (used to confirm). Return false to cancel. */
  confirmDelete?: (item: GalleryItem) => boolean | Promise<boolean>
  /** Thumb size — 'sm' default for inline strips, 'md' for the admin detail page. */
  size?: 'sm' | 'md'
  emptyMessage?: string
}

export default function ScreenshotGallery({
  items, title, onDelete, confirmDelete, size = 'sm', emptyMessage,
}: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const thumbCls = size === 'md' ? 'w-24 h-24' : 'w-16 h-16'

  if (items.length === 0) {
    if (!emptyMessage) return null
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">{emptyMessage}</p>
    )
  }

  async function handleDelete(item: GalleryItem) {
    if (confirmDelete) {
      const ok = await confirmDelete(item)
      if (!ok) return
    }
    onDelete?.(item)
  }

  return (
    <div>
      {title && (
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
          {title}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {items.map((it, idx) => (
          <div key={it.id} className="relative group">
            <button
              type="button"
              onClick={() => setLightboxIndex(idx)}
              className={`${thumbCls} rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800 flex items-center justify-center`}
              title={it.file_name}
            >
              {it.viewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={it.viewUrl} alt={it.file_name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-gray-400 px-1 text-center">{it.file_name}</span>
              )}
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={() => handleDelete(it)}
                className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        ))}
      </div>

      {lightboxIndex !== null && (
        <ScreenshotLightbox
          images={items.map(i => ({ url: i.viewUrl ?? '', alt: i.file_name }))}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
        />
      )}
    </div>
  )
}
