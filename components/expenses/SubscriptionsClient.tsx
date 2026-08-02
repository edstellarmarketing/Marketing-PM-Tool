'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ExternalLink, Loader2, Pencil, Plus, Receipt, Search, Trash2, X } from 'lucide-react'
import ExpenseForm, { emptyValues, type ExpenseFormValues } from '@/components/expenses/ExpenseForm'
import SubscriptionForm, { type SubscriptionFormValues, emptySubscription } from '@/components/expenses/SubscriptionForm'
import { cn } from '@/lib/utils'
import type { ExpenseLookups } from '@/types'

export interface SubscriptionRow {
  id: string
  ref: string | null
  name: string
  vendor_id: string | null
  billing_cycle: string
  amount_usd: number | null
  started_on: string | null
  ends_on: string | null
  payment_method: string | null
  status: string
  owner_profile_id: string | null
  owner_name: string | null
  team_id: string | null
  seats: number | null
  invoice_url: string | null
  notes: string | null
  vendor_name: string | null
  team_name: string | null
  owner_display: string | null
  last_charge_date: string | null
  charge_count: number
  charged_total: number
  is_overdue: boolean
}

const CYCLE_LABEL: Record<string, string> = {
  monthly: 'Monthly', yearly: 'Yearly', credits: 'Credits', one_time: 'One time', custom: 'Custom',
}

const STATUS_CLS: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  expired: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
}

const usd = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

function formatDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysUntil(d: string | null): number | null {
  if (!d) return null
  const [y, m, day] = d.split('-').map(Number)
  const target = new Date(y, m - 1, day)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

const EMPTY_LOOKUPS: ExpenseLookups = { categories: [], teams: [], verticals: [], vendors: [], backlinkTypes: [] }

// canManage gates every mutation control; the API re-checks each one.
export default function SubscriptionsClient({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<SubscriptionRow[]>([])
  const [lookups, setLookups] = useState<ExpenseLookups>(EMPTY_LOOKUPS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [status, setStatus] = useState('active')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')

  const [editing, setEditing] = useState<{ initial?: SubscriptionFormValues } | null>(null)
  const [charging, setCharging] = useState<ExpenseFormValues | null>(null)

  useEffect(() => {
    fetch('/api/expenses/lookups', { cache: 'no-store' })
      .then(r => r.json()).then(d => { if (!d.error) setLookups(d) })
      .catch(() => { /* filters degrade, the table still works */ })
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (status) p.set('status', status)
    if (debounced.trim()) p.set('q', debounced.trim())
    return p.toString()
  }, [status, debounced])

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/expenses/subscriptions?${query}`, { cache: 'no-store' })
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Failed to load subscriptions'); return }
        setRows(data)
      } catch {
        if (!cancelled) setError('Connection error loading subscriptions')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [query, reloadKey])

  // Pre-fills the expense form from the commitment. Nothing is written until the
  // user saves — no charge is ever generated on a schedule (decision 4).
  function logCharge(s: SubscriptionRow) {
    const toolsCategory = lookups.categories.find(c => c.slug === 'tools-subscriptions')
    setCharging({
      ...emptyValues(),
      subscription_id: s.id,
      subscription_name: s.name,
      category_id: toolsCategory?.id ?? '',
      vendor_id: s.vendor_id,
      team_id: s.team_id ?? '',
      amount_usd: s.amount_usd === null ? '' : String(s.amount_usd),
      payment_method: s.payment_method ?? '',
      description: s.name,
      invoice_url: s.invoice_url ?? '',
    })
  }

  async function remove(s: SubscriptionRow) {
    if (!window.confirm(`Delete the subscription “${s.name}”?\n\nCharges already logged against it stay in the ledger.`)) return
    setBusyId(s.id)
    try {
      const res = await fetch(`/api/expenses/subscriptions/${s.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(typeof d.error === 'string' ? d.error : 'Could not delete')
        return
      }
      setReloadKey(k => k + 1)
    } finally {
      setBusyId(null)
    }
  }

  const activeCount = rows.filter(r => r.status === 'active').length
  const overdue = rows.filter(r => r.is_overdue).length
  const annualised = rows
    .filter(r => r.status === 'active' && r.amount_usd !== null)
    .reduce((a, r) => a + (r.billing_cycle === 'monthly' ? r.amount_usd! * 12 : r.billing_cycle === 'yearly' ? r.amount_usd! : 0), 0)

  return (
    <div className="space-y-4">
      {editing && (
        <SubscriptionForm
          key={editing.initial?.id ?? 'new'}
          lookups={lookups}
          initial={editing.initial}
          onClose={() => setEditing(null)}
          onSaved={() => { setReloadKey(k => k + 1); setEditing(null) }}
          onLookupsChanged={setLookups}
        />
      )}

      {charging && (
        <ExpenseForm
          key={`charge-${charging.subscription_id}`}
          lookups={lookups}
          initial={charging}
          onClose={() => setCharging(null)}
          onLookupsChanged={setLookups}
          onSaved={({ keepOpen }) => { setReloadKey(k => k + 1); if (!keepOpen) setCharging(null) }}
        />
      )}

      {/* Summary of the commitment, not of spend — these are per-cycle prices */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 shadow-sm">
          <p className="text-xs text-gray-500">Active subscriptions</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{activeCount}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 shadow-sm">
          <p className="text-xs text-gray-500">Committed per year</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">
            {annualised.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
          </p>
          {/* Credits and one-time rows have no annual figure, so say so rather
              than quietly folding them in at zero. */}
          <p className="text-xs text-gray-500">monthly × 12 plus yearly; excludes credits and one-time</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 shadow-sm">
          <p className="text-xs text-gray-500">Past their renewal date</p>
          <p className={cn('text-2xl font-semibold', overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white')}>
            {overdue}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, owner, notes…"
            className="w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 dark:text-white rounded-lg pl-9 pr-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          {([['active', 'Active'], ['cancelled', 'Cancelled'], ['', 'All']] as const).map(([v, lbl]) => (
            <button
              key={lbl}
              onClick={() => setStatus(v)}
              className={cn('px-3 py-1 rounded text-sm font-medium transition-colors',
                status === v ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200')}
            >
              {lbl}
            </button>
          ))}
        </div>
        <button
          onClick={() => setEditing({})}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-900 dark:bg-blue-600 hover:bg-gray-800 dark:hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={15} />
          Add subscription
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg text-red-600 dark:text-red-400 text-xs font-medium">
          <AlertCircle size={14} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={13} /></button>
        </div>
      )}

      {/* Registry */}
      <div className={cn('bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm transition-opacity', loading && 'opacity-60')}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {rows.length} {rows.length === 1 ? 'subscription' : 'subscriptions'}
          </p>
          {loading && <Loader2 size={15} className="text-gray-400 animate-spin" />}
        </div>

        {rows.length === 0 && !loading ? (
          <p className="px-4 py-12 text-center text-sm text-gray-500">No subscriptions match.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">REF</th>
                  <th className="px-3 py-2 text-left font-semibold">SUBSCRIPTION</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">CYCLE</th>
                  <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">PRICE / CYCLE</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">RENEWS</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">LAST CHARGE</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">OWNER</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">STATUS</th>
                  <th className="px-2 py-2 w-8" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {rows.map(s => {
                  const days = daysUntil(s.ends_on)
                  return (
                    <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-mono text-xs text-gray-400 select-all">{s.ref || '—'}</span>
                      </td>
                      <td className="px-3 py-2.5 max-w-xs">
                        <p className="text-gray-900 dark:text-white truncate">{s.name}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {[s.vendor_name, s.team_name, s.seats ? `${s.seats} seats` : null].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 dark:text-gray-300">
                        {CYCLE_LABEL[s.billing_cycle] ?? s.billing_cycle}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-gray-900 dark:text-white">
                        {usd(s.amount_usd)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={cn('tabular-nums', s.is_overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-600 dark:text-gray-300')}>
                          {formatDate(s.ends_on)}
                        </span>
                        {days !== null && s.status === 'active' && (
                          <span className="block text-xs text-gray-400">
                            {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'today' : `in ${days}d`}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 dark:text-gray-300">
                        {formatDate(s.last_charge_date)}
                        {s.charge_count > 0 && (
                          <span className="block text-xs text-gray-400 tabular-nums">
                            {s.charge_count} logged · {usd(s.charged_total)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-500">{s.owner_display ?? '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_CLS[s.status])}>
                          {s.status}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right whitespace-nowrap">
                        {busyId === s.id ? (
                          <Loader2 size={14} className="text-gray-400 animate-spin inline" />
                        ) : (
                          <span className="inline-flex">
                            {s.invoice_url && (
                              <a
                                href={s.invoice_url} target="_blank" rel="noopener noreferrer" title="Invoice"
                                className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                            <button
                              onClick={() => logCharge(s)} title="Log a charge against this subscription"
                              className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950/40 rounded-lg transition-colors"
                            >
                              <Receipt size={14} />
                            </button>
                            <button
                              onClick={() => setEditing({ initial: toFormValues(s) })} title="Edit"
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors"
                            >
                              <Pencil size={14} />
                            </button>
                            {canManage && (
                              <button
                                onClick={() => remove(s)} title="Delete"
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function toFormValues(s: SubscriptionRow): SubscriptionFormValues {
  return {
    ...emptySubscription(),
    id: s.id,
    name: s.name,
    vendor_id: s.vendor_id,
    billing_cycle: s.billing_cycle,
    amount_usd: s.amount_usd === null ? '' : String(s.amount_usd),
    started_on: s.started_on ?? '',
    ends_on: s.ends_on ?? '',
    payment_method: s.payment_method ?? '',
    status: s.status,
    owner_name: s.owner_name ?? '',
    team_id: s.team_id ?? '',
    seats: s.seats === null ? '' : String(s.seats),
    invoice_url: s.invoice_url ?? '',
    notes: s.notes ?? '',
  }
}
