'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

export default function AnnouncementDeleteButton({ id, title }: { id: string; title: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(typeof data?.error === 'string' ? data.error : `Delete failed (${res.status}).`)
      }
      router.push('/admin/announcements')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.')
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
      >
        <Trash2 size={14} /> {busy ? 'Deleting…' : 'Delete announcement'}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  )
}
