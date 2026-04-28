'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Result {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
}

const statusColor: Record<string, string> = {
  todo: 'text-gray-500',
  in_progress: 'text-blue-600',
  review: 'text-yellow-600',
  done: 'text-green-600',
  blocked: 'text-red-600',
}

export default function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const ref = useRef<HTMLDivElement>(null)

  // Keyboard shortcut: / to focus
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const activeEl = document.activeElement as HTMLElement | null
      if (e.key === '/' && activeEl?.tagName !== 'INPUT' && activeEl?.tagName !== 'TEXTAREA' && !activeEl?.isContentEditable) {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === 'Escape') { setOpen(false); setQuery('') }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const timeout = setTimeout(async () => {
      setLoading(true)
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      setLoading(false)
      if (res.ok) setResults(await res.json())
    }, 250)
    return () => clearTimeout(timeout)
  }, [query])

  function handleSelect(id: string) {
    setOpen(false)
    setQuery('')
    router.push(`/tasks/${id}`)
  }

  return (
    <div className="relative w-64" ref={ref}>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg border border-transparent focus-within:border-blue-500 focus-within:bg-white dark:focus-within:bg-gray-900 transition-colors">
        <Search size={14} className="text-gray-400 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder='Search tasks… (/)'
          className="flex-1 bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 outline-none"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]) }} className="text-gray-400 hover:text-gray-600">
            <X size={13} />
          </button>
        )}
      </div>

      {open && (query.length >= 2) && (
        <div className="absolute top-10 left-0 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          {loading && <p className="text-xs text-gray-400 text-center py-3">Searching…</p>}
          {!loading && results.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-3">No tasks found</p>
          )}
          {results.map(r => (
            <button
              key={r.id}
              onClick={() => handleSelect(r.id)}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-50 dark:border-gray-800 last:border-0 text-left transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{r.title}</p>
                <p className={cn('text-xs mt-0.5 capitalize', statusColor[r.status] ?? 'text-gray-500')}>
                  {r.status.replace('_', ' ')} · {r.priority}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
