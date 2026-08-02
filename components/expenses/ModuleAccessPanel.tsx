'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertCircle, ShieldCheck, UserPlus, Trash2 } from 'lucide-react'

interface ProfileLite {
  id: string
  full_name: string
  avatar_url: string | null
  designation: string | null
  department: string | null
}

interface Grant {
  id: string
  user_id: string
  role: 'viewer' | 'manager'
  granted_at: string
  note: string | null
  user: ProfileLite | null
  granter_name: string | null
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function ModuleAccessPanel({ currentUserId }: { currentUserId: string }) {
  const [grants, setGrants] = useState<Grant[]>([])
  const [people, setPeople] = useState<ProfileLite[]>([])
  const [selected, setSelected] = useState('')
  const [note, setNote] = useState('')
  const [role, setRole] = useState<'viewer' | 'manager'>('viewer')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setError(null)
      try {
        const [grantsRes, usersRes] = await Promise.all([
          fetch('/api/expenses/access', { cache: 'no-store' }),
          fetch('/api/users', { cache: 'no-store' }),
        ])
        const grantsData = await grantsRes.json()
        const usersData = await usersRes.json()
        if (cancelled) return
        if (!grantsRes.ok) { setError(grantsData.error || 'Failed to load access list'); return }
        setGrants(grantsData)
        if (usersRes.ok) setPeople(usersData)
      } catch (err) {
        console.error(err)
        if (!cancelled) setError('Connection error loading access list')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/expenses/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selected, note: note.trim() || undefined, role }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to grant access'); return }

      const person = people.find(p => p.id === selected) ?? null
      setGrants(prev => [...prev, { ...data, user: person, granter_name: 'You' }])
      setSelected('')
      setNote('')
      setRole('viewer')
    } catch (err) {
      console.error(err)
      setError('Connection error granting access')
    } finally {
      setSaving(false)
    }
  }

  async function handleRoleChange(grant: Grant, next: 'viewer' | 'manager') {
    setError(null)
    const previous = grant.role
    // Optimistic, then rolled back on failure — the select would otherwise snap
    // back with no explanation.
    setGrants(prev => prev.map(g => (g.id === grant.id ? { ...g, role: next } : g)))
    try {
      const res = await fetch('/api/expenses/access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: grant.id, role: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(typeof data.error === 'string' ? data.error : 'Failed to change role')
        setGrants(prev => prev.map(g => (g.id === grant.id ? { ...g, role: previous } : g)))
      }
    } catch {
      setError('Connection error changing role')
      setGrants(prev => prev.map(g => (g.id === grant.id ? { ...g, role: previous } : g)))
    }
  }

  async function handleRevoke(grant: Grant) {
    const name = grant.user?.full_name ?? 'this user'
    if (!window.confirm(`Revoke Expenses access for ${name}?\n\nThey lose the sidebar entry and see "No access" immediately, and stop receiving the weekly email.`)) return
    setError(null)
    try {
      const res = await fetch(`/api/expenses/access?id=${grant.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to revoke access')
        return
      }
      setGrants(prev => prev.filter(g => g.id !== grant.id))
    } catch (err) {
      console.error(err)
      setError('Connection error revoking access')
    }
  }

  const granted = new Set(grants.map(g => g.user_id))
  const candidates = people.filter(p => !granted.has(p.id))

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheck size={18} className="text-blue-500" />
            Module Access
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Only you can grant or revoke Expenses. People without a grant have no
            sidebar entry and see “No access” if they follow a direct link.
            <span className="block mt-1">
              <strong>Viewer</strong> reads everything and changes nothing ·{' '}
              <strong>Ledger manager</strong> adds, edits and deletes entries.
            </span>
          </p>
        </div>
        {loading && <Loader2 size={16} className="text-gray-400 animate-spin" />}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg text-red-600 dark:text-red-400 text-xs font-medium">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <form onSubmit={handleGrant} className="flex flex-col sm:flex-row gap-2 mb-6">
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          disabled={saving || loading}
          className="flex-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 dark:text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-800 transition-all outline-none"
        >
          <option value="">Select a person…</option>
          {candidates.map(p => (
            <option key={p.id} value={p.id}>
              {p.full_name}{p.designation ? ` — ${p.designation}` : ''}
            </option>
          ))}
        </select>
        {/* Defaults to viewer: granting read access should be the easy path, and
            the ability to delete four years of history should be a choice. */}
        <select
          value={role}
          onChange={e => setRole(e.target.value as 'viewer' | 'manager')}
          disabled={saving || loading}
          className="sm:w-44 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
        >
          <option value="viewer">Viewer — read only</option>
          <option value="manager">Ledger manager</option>
        </select>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Reason (optional)"
          disabled={saving || loading}
          className="sm:w-44 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 dark:text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-800 transition-all outline-none"
        />
        <button
          type="submit"
          disabled={!selected || saving}
          className="inline-flex items-center justify-center gap-2 px-6 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-50 shadow-sm"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
          Grant
        </button>
      </form>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : grants.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">Nobody has access yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {grants.map(g => (
            <li key={g.id} className="flex items-center gap-3 py-3">
              {g.user?.avatar_url ? (
                <img src={g.user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {initials(g.user?.full_name ?? '?')}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {g.user?.full_name ?? 'Unknown user'}
                  {g.user_id === currentUserId && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-purple-600 text-white">you</span>
                  )}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {[g.user?.designation, g.user?.department].filter(Boolean).join(' · ') || '—'}
                  {g.note && ` · ${g.note}`}
                </p>
              </div>
              {/* The owner's own row is fixed at manager — moduleRole() promotes
                  them regardless, so an editable control here would lie. */}
              {g.user_id === currentUserId ? (
                <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 font-medium whitespace-nowrap">
                  Ledger manager
                </span>
              ) : (
                <>
                  <select
                    value={g.role}
                    onChange={e => handleRoleChange(g, e.target.value as 'viewer' | 'manager')}
                    className="text-xs bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 dark:text-white rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="manager">Ledger manager</option>
                  </select>
                  <button
                    onClick={() => handleRevoke(g)}
                    title="Revoke access"
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
