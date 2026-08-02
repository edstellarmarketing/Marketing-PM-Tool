'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, EyeOff, Loader2, Pencil, Plus, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExpenseLookups } from '@/types'

type LookupKey = keyof ExpenseLookups

const TABS: { key: LookupKey; label: string; note: string }[] = [
  { key: 'categories', label: 'Categories', note: 'The dashboard’s reporting groups and the Summary sheet’s columns. Renaming one changes every report — retire rather than repurpose.' },
  { key: 'teams', label: 'Teams', note: 'Company-wide teams. Separate from the app’s departments on purpose.' },
  { key: 'verticals', label: 'Verticals', note: 'Recorded on link and content spend.' },
  { key: 'backlinkTypes', label: 'Link types', note: 'Applies to Paid Links and HARO Links.' },
  { key: 'vendors', label: 'Vendors', note: 'New tools and publishers appear constantly — add them as you go.' },
]

interface Item { id: string; name: string; is_active: boolean }

export default function LookupManager() {
  const [tab, setTab] = useState<LookupKey>('vendors')
  const [data, setData] = useState<ExpenseLookups | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showRetired, setShowRetired] = useState(false)

  // Bumped after every mutation so the effect refetches; keeps the fetch inside
  // the effect rather than calling a setState-ing function from its body.
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey(k => k + 1)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const res = await fetch('/api/expenses/lookups', { cache: 'no-store' })
        const body = await res.json()
        if (cancelled) return
        if (res.ok) setData(body)
        else setError(body.error || 'Failed to load lookups')
      } catch {
        if (!cancelled) setError('Connection error loading lookups')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [reloadKey])

  const current = useMemo<Item[]>(() => {
    const list = (data?.[tab] ?? []) as Item[]
    return showRetired ? list : list.filter(i => i.is_active !== false)
  }, [data, tab, showRetired])

  const meta = TABS.find(t => t.key === tab)!

  async function add() {
    if (!newName.trim() || saving) return
    setSaving(true); setError(null); setNotice(null)
    try {
      const res = await fetch(`/api/expenses/lookups/${tab}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      const body = await res.json()
      if (!res.ok) { setError(typeof body.error === 'string' ? body.error : 'Could not add'); return }
      if (body.already_existed) setNotice(`“${body.name}” already exists — selected the existing entry.`)
      setNewName('')
      reload()
    } finally {
      setSaving(false)
    }
  }

  async function patch(id: string, payload: Record<string, unknown>) {
    setBusyId(id); setError(null); setNotice(null)
    try {
      const res = await fetch(`/api/expenses/lookups/${tab}/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) { setError(typeof body.error === 'string' ? body.error : 'Could not save'); return }
      setEditingId(null)
      reload()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
      <h2 className="font-semibold text-gray-900 dark:text-white">Lookups</h2>
      <p className="text-xs text-gray-500 mt-0.5 mb-4">
        The values behind every dropdown. Ledger managers and the owner can both
        maintain these. Entries are retired, never deleted — a retired entry still
        resolves on the rows that already point at it.
      </p>

      <div className="flex flex-wrap gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit mb-3">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setEditingId(null); setNewName(''); setError(null); setNotice(null) }}
            className={cn('px-3 py-1 rounded text-sm font-medium transition-colors',
              tab === t.key
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200')}
          >
            {t.label}
            <span className="ml-1.5 text-xs text-gray-400 tabular-nums">
              {((data?.[t.key] ?? []) as Item[]).filter(i => i.is_active !== false).length}
            </span>
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-500 mb-3">{meta.note}</p>

      {error && (
        <div className="mb-3 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg text-red-600 dark:text-red-400 text-xs font-medium">
          <AlertCircle size={14} />{error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={13} /></button>
        </div>
      )}
      {notice && (
        <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-lg text-blue-700 dark:text-blue-300 text-xs font-medium">
          {notice}
        </div>
      )}

      <form onSubmit={e => { e.preventDefault(); add() }} className="flex gap-2 mb-4">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder={`Add a ${meta.label.replace(/s$/, '').toLowerCase()}…`}
            className="flex-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button
            type="submit" disabled={!newName.trim() || saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 dark:bg-blue-600 hover:bg-gray-800 dark:hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add
          </button>
      </form>

      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400">{current.length} shown</p>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
          <input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" />
          Show retired
        </label>
      </div>

      {loading ? (
        <div className="space-y-1.5">{[1, 2, 3].map(i => <div key={i} className="h-9 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />)}</div>
      ) : (
        <ul className="divide-y divide-gray-50 dark:divide-gray-800 max-h-96 overflow-y-auto">
          {current.map(item => (
            <li key={item.id} className="flex items-center gap-2 py-1.5">
              {editingId === item.id ? (
                <>
                  <input
                    autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); patch(item.id, { name: editName.trim() }) }
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="flex-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 dark:text-white rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button onClick={() => patch(item.id, { name: editName.trim() })} disabled={!editName.trim()}
                    className="p-1.5 text-gray-400 hover:text-green-600 rounded-lg disabled:opacity-40"><Check size={14} /></button>
                  <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"><X size={14} /></button>
                </>
              ) : (
                <>
                  <span className={cn('flex-1 text-sm truncate',
                    item.is_active === false ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200')}>
                    {item.name}
                  </span>
                  {busyId === item.id ? (
                    <Loader2 size={14} className="text-gray-400 animate-spin" />
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingId(item.id); setEditName(item.name) }}
                        title="Rename"
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => patch(item.id, { is_active: item.is_active === false })}
                        title={item.is_active === false ? 'Restore' : 'Retire — hides it from pickers, keeps existing rows intact'}
                        className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg"
                      >
                        {item.is_active === false ? <RotateCcw size={13} /> : <EyeOff size={13} />}
                      </button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
          {current.length === 0 && <li className="py-6 text-center text-sm text-gray-500">Nothing here yet.</li>}
        </ul>
      )}
    </div>
  )
}
