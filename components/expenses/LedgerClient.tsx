'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowDown, ArrowUp, Download, ExternalLink, FileText, Loader2, Pencil, Plus, RotateCcw, Search, Trash2, Upload, X } from 'lucide-react'
import Paginator from '@/components/ui/Paginator'
import ExpenseForm, { emptyValues, type ExpenseFormValues } from '@/components/expenses/ExpenseForm'
import ImportDialog from '@/components/expenses/ImportDialog'
import { cn } from '@/lib/utils'
import type { ExpenseLookups, ExpenseMeta, ExpensePaymentStatus } from '@/types'

interface LedgerRow {
  id: string
  ref: string | null
  expense_date: string
  amount_usd: number
  tax_usd: number | null
  total_usd: number
  initial_price_usd: number | null
  category_id: string
  backlink_type_id: string | null
  vendor_id: string | null
  team_id: string | null
  vertical_id: string | null
  link_url: string | null
  link_site: string | null
  link_domain: string | null
  link_rel: string | null
  payee: string | null
  acquired_by: string | null
  country: string | null
  payment_status: ExpensePaymentStatus
  payment_method: string | null
  invoice_url: string | null
  description: string | null
  notes: string | null
  meta: ExpenseMeta
  category_name: string | null
  team_name: string | null
  vertical_name: string | null
  vendor_name: string | null
  backlink_type_name: string | null
  created_by_name: string | null
  deleted_at: string | null
  deleted_by_name: string | null
}

// Ledger row → form values. Numbers become strings so an empty field stays
// empty rather than rendering "0", which matters for tax: blank means
// "not recorded" and 0 would claim "no tax was charged".
function toFormValues(r: LedgerRow): ExpenseFormValues {
  return {
    ...emptyValues(),
    id: r.id,
    expense_date: r.expense_date,
    amount_usd: String(r.amount_usd),
    tax_usd: r.tax_usd === null ? '' : String(r.tax_usd),
    initial_price_usd: r.initial_price_usd === null ? '' : String(r.initial_price_usd),
    category_id: r.category_id,
    backlink_type_id: r.backlink_type_id ?? '',
    vendor_id: r.vendor_id,
    team_id: r.team_id ?? '',
    vertical_id: r.vertical_id ?? '',
    link_url: r.link_url ?? '',
    link_site: r.link_site ?? '',
    link_rel: r.link_rel ?? '',
    payee: r.payee ?? '',
    acquired_by: r.acquired_by ?? '',
    country: r.country ?? '',
    payment_status: r.payment_status,
    payment_method: r.payment_method ?? '',
    invoice_url: r.invoice_url ?? '',
    description: r.description ?? '',
    notes: r.notes ?? '',
    meta: r.meta ?? {},
  }
}

interface Totals { net_usd: number; tax_usd: number; total_usd: number }

const STATUS_CLS: Record<string, string> = {
  paid:     'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  pending:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  refunded: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  free:     'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

function formatDate(d: string) {
  // Date-only string — split rather than new Date(), which would shift the day
  // for anyone behind UTC.
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const EMPTY_LOOKUPS: ExpenseLookups = {
  categories: [], teams: [], verticals: [], vendors: [], backlinkTypes: [],
}

// Declared at module scope: a component defined inside render is a new type on
// every pass, which resets its state and defeats reconciliation.
function SortHeader({ column, label, className, sort, dir, onSort }: {
  column: string
  label: string
  className?: string
  sort: string
  dir: 'asc' | 'desc'
  onSort: (column: string) => void
}) {
  return (
    <th className={cn('px-3 py-2 text-left font-semibold whitespace-nowrap', className)}>
      <button onClick={() => onSort(column)} className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white">
        {label}
        {sort === column && (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  )
}

// canManage gates every mutation control. Rendering only — the API re-checks
// each one with requireModuleManager().
export default function LedgerClient({ canManage, isOwner }: { canManage: boolean; isOwner: boolean }) {
  // Recycle-bin mode. Owner-only, and the API re-checks — this flag only decides
  // what to render.
  const [showDeleted, setShowDeleted] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [rows, setRows] = useState<LedgerRow[]>([])
  const [lookups, setLookups] = useState<ExpenseLookups>(EMPTY_LOOKUPS)
  const [total, setTotal] = useState(0)
  const [totals, setTotals] = useState<Totals>({ net_usd: 0, tax_usd: 0, total_usd: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sort, setSort] = useState('expense_date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filters, setFilters] = useState({
    month: '', category: '', team: '', vertical: '', vendor: '', backlinkType: '', status: '',
  })

  // null = closed. An object = open, with `initial` undefined for a new entry.
  const [editing, setEditing] = useState<{ initial?: ExpenseFormValues } | null>(null)
  const [importing, setImporting] = useState(false)
  // Bumped after every save so the list refetches even when no filter changed.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    fetch('/api/expenses/lookups', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!d.error) setLookups(d) })
      .catch(() => { /* filter dropdowns stay empty; the table still works */ })
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [search])

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort, dir })
    if (debouncedSearch.trim()) p.set('q', debouncedSearch.trim())
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v)
    if (showDeleted) p.set('deleted', '1')
    return p.toString()
  }, [page, pageSize, sort, dir, debouncedSearch, filters, showDeleted])

  async function softDelete(r: LedgerRow) {
    const what = r.description || r.link_domain || usd(r.total_usd)
    if (!window.confirm(`Delete “${what}”?\n\nIt is removed from the ledger and all totals, but kept so you can restore it.`)) return
    setBusyId(r.id)
    setError(null)
    try {
      const res = await fetch(`/api/expenses/${r.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(typeof d.error === 'string' ? d.error : 'Could not delete')
        return
      }
      setReloadKey(k => k + 1)
    } catch {
      setError('Connection error deleting entry')
    } finally {
      setBusyId(null)
    }
  }

  async function restore(r: LedgerRow) {
    setBusyId(r.id)
    setError(null)
    try {
      const res = await fetch(`/api/expenses/${r.id}/restore`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(typeof d.error === 'string' ? d.error : 'Could not restore')
        return
      }
      setReloadKey(k => k + 1)
    } catch {
      setError('Connection error restoring entry')
    } finally {
      setBusyId(null)
    }
  }

  // `cancelled` matters here beyond unmount cleanup: search is debounced and
  // filters change fast, so without it a slow earlier response can land after a
  // newer one and overwrite the table with stale rows.
  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/expenses?${query}`, { cache: 'no-store' })
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) { setError(data.error || 'Failed to load expenses'); return }
        setRows(data.rows)
        setTotal(data.total)
        setTotals(data.totals)
        // The server clamps a page past the end of the result set; follow it so
        // the paginator does not keep showing a page number that no longer exists.
        if (typeof data.page === 'number' && data.page !== page) setPage(data.page)
      } catch (err) {
        console.error(err)
        if (!cancelled) setError('Connection error loading expenses')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
    // `page` is read only to detect a server-side clamp; `query` already carries it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, reloadKey])

  function setFilter(key: keyof typeof filters, value: string) {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }

  function toggleSort(column: string) {
    if (sort === column) setDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSort(column); setDir('desc') }
    setPage(1)
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length + (debouncedSearch ? 1 : 0)

  function clearAll() {
    setFilters({ month: '', category: '', team: '', vertical: '', vendor: '', backlinkType: '', status: '' })
    setSearch('')
    setPage(1)
  }

  return (
    <div className="space-y-4">
      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          // Refetch rather than patching state: a bulk update can touch rows on
          // other pages and change the footer totals.
          onApplied={() => setReloadKey(k => k + 1)}
        />
      )}
      {editing && (
        <ExpenseForm
          // Remount when the target row changes; 'new' is stable across
          // consecutive "save and add another" so retained fields survive.
          key={editing.initial?.id ?? 'new'}
          lookups={lookups}
          initial={editing.initial}
          onClose={() => setEditing(null)}
          onLookupsChanged={setLookups}
          onSaved={({ keepOpen }) => {
            setReloadKey(k => k + 1)
            if (!keepOpen) setEditing(null)
          }}
        />
      )}

      {/* Filter bar */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ref, description, payee, link, notes…"
              className="w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 dark:text-white rounded-lg pl-9 pr-3 py-2 focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-800 transition-all outline-none"
            />
          </div>
          <input
            type="month"
            value={filters.month}
            onChange={e => setFilter('month', e.target.value)}
            className="text-sm bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
          />
          {activeFilterCount > 0 && (
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <X size={14} />
              Clear ({activeFilterCount})
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {([
            ['category', 'All categories', lookups.categories],
            ['team', 'All teams', lookups.teams],
            ['vertical', 'All verticals', lookups.verticals],
            ['vendor', 'All vendors', lookups.vendors],
            ['backlinkType', 'All link types', lookups.backlinkTypes],
          ] as const).map(([key, placeholder, options]) => (
            <select
              key={key}
              value={filters[key]}
              onChange={e => setFilter(key, e.target.value)}
              className="text-sm bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 dark:text-white rounded-lg px-2 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">{placeholder}</option>
              {options.map(o => (
                <option key={o.id} value={o.id}>{o.name}{o.is_active === false ? ' (retired)' : ''}</option>
              ))}
            </select>
          ))}
          <select
            value={filters.status}
            onChange={e => setFilter('status', e.target.value)}
            className="text-sm bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 dark:text-white rounded-lg px-2 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All statuses</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="refunded">Refunded</option>
            <option value="free">Free</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg text-red-600 dark:text-red-400 text-xs font-medium">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Totals for the whole filtered set, not just this page */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {([
          ['Total (incl. tax)', totals.total_usd, 'text-gray-900 dark:text-white'],
          ['Net of tax', totals.net_usd, 'text-gray-600 dark:text-gray-300'],
          ['Tax recorded', totals.tax_usd, 'text-gray-600 dark:text-gray-300'],
        ] as const).map(([label, value, cls]) => (
          <div key={label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={cn('text-lg font-bold tabular-nums', cls)}>{usd(value)}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {showDeleted && <span className="text-red-600 dark:text-red-400">Deleted · </span>}
            {total} {total === 1 ? 'entry' : 'entries'}
            {activeFilterCount > 0 && <span className="text-gray-400 font-normal"> · filtered</span>}
          </p>
          <div className="flex items-center gap-2">
            {loading && <Loader2 size={15} className="text-gray-400 animate-spin" />}
            {total > 0 && (
              // Plain link, not fetch+blob: the browser handles the download and
              // the filename from Content-Disposition. `query` is the same string
              // the table was loaded with, so the export is exactly what is on
              // screen — including the current sort.
              <a
                href={`/api/expenses/export?${query}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title={`Export these ${total} ${total === 1 ? 'entry' : 'entries'} to Excel`}
              >
                <Download size={14} />
                Export
              </a>
            )}
            {!showDeleted && canManage && (
              <button
                onClick={() => setImporting(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title="Update many entries at once from an edited export"
              >
                <Upload size={14} />
                Import
              </button>
            )}
            {canManage && isOwner && (
              <button
                onClick={() => { setShowDeleted(s => !s); setPage(1) }}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
                  showDeleted
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800',
                )}
              >
                <Trash2 size={14} />
                {showDeleted ? 'Back to ledger' : 'Deleted records'}
              </button>
            )}
            {!showDeleted && canManage && (
              <button
                onClick={() => setEditing({})}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 dark:bg-blue-600 hover:bg-gray-800 dark:hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
              >
                <Plus size={15} />
                Add expense
              </button>
            )}
          </div>
        </div>

        {loading && rows.length === 0 ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-gray-500">
              {showDeleted
                ? 'Nothing has been deleted.'
                : activeFilterCount > 0 ? 'No entries match these filters.' : 'No expenses recorded yet.'}
            </p>
            {activeFilterCount > 0 ? (
              <button onClick={clearAll} className="mt-2 text-sm text-blue-600 hover:underline">Clear filters</button>
            ) : showDeleted || !canManage ? null : (
              <button onClick={() => setEditing({})} className="mt-2 text-sm text-blue-600 hover:underline">
                Add the first expense
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">REF</th>
                  <SortHeader column="expense_date" label="DATE" sort={sort} dir={dir} onSort={toggleSort} />
                  <th className="px-3 py-2 text-left font-semibold">DETAIL</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">CATEGORY</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">VENDOR</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">TEAM / VERTICAL</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">STATUS</th>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">INVOICE</th>
                  <SortHeader column="total_usd" label="AMOUNT" className="text-right" sort={sort} dir={dir} onSort={toggleSort} />
                  <th className="px-2 py-2 w-8" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    {/* Stable handle for spreadsheet round-trips. Monospace so a
                        transposed digit is easy to spot when comparing against
                        an exported sheet. */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-mono text-xs text-gray-400 select-all">{r.ref || '—'}</span>
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 dark:text-gray-300 tabular-nums">
                      {formatDate(r.expense_date)}
                    </td>

                    <td className="px-3 py-2.5 max-w-xs">
                      <p className="text-gray-900 dark:text-white truncate">
                        {r.description || r.link_domain || r.payee || '—'}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {showDeleted && r.deleted_at
                          ? `deleted ${formatDate(r.deleted_at.slice(0, 10))}${r.deleted_by_name ? ` by ${r.deleted_by_name}` : ''}`
                          : [
                              r.backlink_type_name,
                              r.link_rel === 'text_mention' ? 'text mention' : r.link_rel,
                              r.payee && r.payee !== r.description ? `paid ${r.payee}` : null,
                              r.acquired_by ? `via ${r.acquired_by}` : null,
                            ].filter(Boolean).join(' · ') || (r.notes ?? '')}
                      </p>
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 dark:text-gray-300">
                      {r.category_name ?? '—'}
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600 dark:text-gray-300">
                      {r.link_url ? (
                        <a
                          href={r.link_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          {r.vendor_name ?? r.link_domain ?? 'link'}
                          <ExternalLink size={11} />
                        </a>
                      ) : (
                        r.vendor_name ?? '—'
                      )}
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-500">
                      {[r.team_name, r.vertical_name].filter(Boolean).join(' · ') || '—'}
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_CLS[r.payment_status])}>
                        {r.payment_status}
                      </span>
                      {r.payment_method && (
                        <span className="block text-xs text-gray-400">{r.payment_method.replace(/_/g, ' ')}</span>
                      )}
                    </td>

                    {/* Its own column, headed INVOICE, so the field is visible as
                        part of the table even while most rows are still empty —
                        that absence is information: it shows what needs chasing. */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {r.invoice_url ? (
                        <a
                          href={r.invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={r.invoice_url}
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <FileText size={13} />
                          <span className="text-xs">view</span>
                        </a>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <p className="font-semibold text-gray-900 dark:text-white tabular-nums">{usd(r.total_usd)}</p>
                      {/* Only worth the extra line when there is something to say */}
                      {(r.tax_usd !== null || (r.initial_price_usd !== null && r.initial_price_usd > r.amount_usd)) && (
                        <p className="text-xs text-gray-400 tabular-nums">
                          {r.tax_usd !== null && `${usd(r.amount_usd)} + ${usd(r.tax_usd)} tax`}
                          {r.tax_usd !== null && r.initial_price_usd !== null && r.initial_price_usd > r.amount_usd && ' · '}
                          {r.initial_price_usd !== null && r.initial_price_usd > r.amount_usd &&
                            `saved ${usd(r.initial_price_usd - r.amount_usd)}`}
                        </p>
                      )}
                    </td>

                    <td className="px-2 py-2.5 text-right whitespace-nowrap">
                      {busyId === r.id ? (
                        <Loader2 size={14} className="text-gray-400 animate-spin inline" />
                      ) : showDeleted && canManage ? (
                        <button
                          onClick={() => restore(r)}
                          title="Restore entry"
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950/40 rounded-lg transition-colors"
                        >
                          <RotateCcw size={14} />
                        </button>
                      ) : (
                        <span className="inline-flex">
                          {canManage && <button
                            onClick={() => setEditing({ initial: toFormValues(r) })}
                            title="Edit entry"
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors"
                          >
                            <Pencil size={14} />
                          </button>}
                          {canManage && (
                            <button
                              onClick={() => softDelete(r)}
                              title="Delete entry"
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-4 pb-3">
          <Paginator
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[25, 50, 100]}
          />
        </div>
      </div>
    </div>
  )
}
