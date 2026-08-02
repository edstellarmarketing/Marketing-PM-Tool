'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExpenseLookup } from '@/types'

// Type-to-filter vendor picker with inline creation. 85 vendors already and
// growing, so a plain <select> is unusable for the weekly batch — typing three
// letters has to be enough.
export default function VendorCombobox({
  vendors, value, onChange, onVendorCreated, disabled,
}: {
  vendors: ExpenseLookup[]
  value: string | null
  onChange: (id: string | null) => void
  onVendorCreated: (vendor: ExpenseLookup) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wrap = useRef<HTMLDivElement>(null)

  const selected = useMemo(() => vendors.find(v => v.id === value) ?? null, [vendors, value])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = vendors.filter(v => v.is_active !== false || v.id === value)
    if (!q) return pool.slice(0, 60)
    return pool.filter(v => v.name.toLowerCase().includes(q)).slice(0, 60)
  }, [vendors, query, value])

  // Case-insensitive, mirroring the UNIQUE index on lower(name) — so we never
  // offer to "create" something the database will just resolve to an existing row.
  const exactExists = useMemo(
    () => vendors.some(v => v.name.toLowerCase() === query.trim().toLowerCase()),
    [vendors, query],
  )
  const canCreate = query.trim().length > 0 && !exactExists

  async function createVendor() {
    if (!canCreate || creating) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/expenses/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: query.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Could not add vendor'); return }
      onVendorCreated(data)
      onChange(data.id)
      setOpen(false)
      setQuery('')
    } catch (err) {
      console.error(err)
      setError('Connection error adding vendor')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2 text-left focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
      >
        <span className={cn('truncate', selected ? 'text-gray-900 dark:text-white' : 'text-gray-400')}>
          {selected ? selected.name : 'Select vendor…'}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {selected && (
            <X
              size={14}
              className="text-gray-400 hover:text-red-600"
              onClick={e => { e.stopPropagation(); onChange(null) }}
            />
          )}
          <ChevronDown size={14} className="text-gray-400" />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (matches.length === 1) { onChange(matches[0].id); setOpen(false); setQuery('') }
                else if (canCreate) createVendor()
              }
              if (e.key === 'Escape') { setOpen(false); setQuery('') }
            }}
            placeholder="Type to filter…"
            className="text-sm px-3 py-2 border-b border-gray-100 dark:border-gray-800 bg-transparent dark:text-white outline-none"
          />

          {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}

          <div className="overflow-y-auto">
            {matches.map(v => (
              <button
                key={v.id}
                type="button"
                onClick={() => { onChange(v.id); setOpen(false); setQuery('') }}
                className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <span className="truncate">
                  {v.name}
                  {v.is_active === false && <span className="text-gray-400"> (retired)</span>}
                </span>
                {v.id === value && <Check size={13} className="text-blue-600 flex-shrink-0" />}
              </button>
            ))}

            {matches.length === 0 && !canCreate && (
              <p className="px-3 py-3 text-xs text-gray-400">No vendors match.</p>
            )}
          </div>

          {canCreate && (
            <button
              type="button"
              onClick={createVendor}
              disabled={creating}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 border-t border-gray-100 dark:border-gray-800 hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-50"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add “{query.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}
