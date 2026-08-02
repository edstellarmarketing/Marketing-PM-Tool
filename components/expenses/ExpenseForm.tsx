'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, ChevronDown, ChevronRight, Loader2, X } from 'lucide-react'
import DuplicateWarning from '@/components/expenses/DuplicateWarning'
import VendorCombobox from '@/components/expenses/VendorCombobox'
import { cn } from '@/lib/utils'
import type { ExpenseLookup, ExpenseLookups, ExpenseMeta } from '@/types'

// Categories whose rows describe an acquired link — mirrors LINK_CATEGORY_SLUGS
// in lib/expenses.ts.
const LINK_SLUGS = ['paid-links', 'haro-links']

export interface ExpenseFormValues {
  id?: string
  // Set when the entry was raised from a subscription's "log a charge" action, so
  // the charge stays linked to the commitment it settles.
  subscription_id?: string | null
  subscription_name?: string | null
  expense_date: string
  amount_usd: string
  tax_usd: string
  initial_price_usd: string
  category_id: string
  backlink_type_id: string
  vendor_id: string | null
  team_id: string
  vertical_id: string
  link_url: string
  link_site: string
  link_rel: string
  payee: string
  acquired_by: string
  country: string
  payment_status: string
  payment_method: string
  invoice_url: string
  description: string
  notes: string
  meta: ExpenseMeta
}

function todayLocal() {
  const d = new Date()
  // Local, not toISOString() — that would roll back a day for anyone behind UTC.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function emptyValues(): ExpenseFormValues {
  return {
    subscription_id: null,
    subscription_name: null,
    expense_date: todayLocal(),
    amount_usd: '', tax_usd: '', initial_price_usd: '',
    category_id: '', backlink_type_id: '', vendor_id: null, team_id: '', vertical_id: '',
    link_url: '', link_site: '', link_rel: '',
    payee: '', acquired_by: '', country: '',
    payment_status: 'paid', payment_method: '',
    invoice_url: '', description: '', notes: '',
    meta: {},
  }
}

const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
const field = 'w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-800 outline-none transition-all'

function Select({ value, onChange, options, placeholder, disabled }: {
  value: string
  onChange: (v: string) => void
  options: ExpenseLookup[]
  placeholder: string
  disabled?: boolean
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled} className={field}>
      <option value="">{placeholder}</option>
      {options
        .filter(o => o.is_active !== false || o.id === value)
        .map(o => (
          <option key={o.id} value={o.id}>{o.name}{o.is_active === false ? ' (retired)' : ''}</option>
        ))}
    </select>
  )
}

export default function ExpenseForm({
  lookups, initial, onClose, onSaved, onLookupsChanged,
}: {
  lookups: ExpenseLookups
  initial?: ExpenseFormValues
  onClose: () => void
  onSaved: (opts: { keepOpen: boolean }) => void
  onLookupsChanged: (next: ExpenseLookups) => void
}) {
  const isEdit = Boolean(initial?.id)
  const [v, setV] = useState<ExpenseFormValues>(initial ?? emptyValues())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [showMore, setShowMore] = useState(false)
  const [justSaved, setJustSaved] = useState<string | null>(null)

  const set = <K extends keyof ExpenseFormValues>(k: K, val: ExpenseFormValues[K]) =>
    setV(prev => ({ ...prev, [k]: val }))
  const setMeta = (k: string, val: unknown) =>
    setV(prev => ({ ...prev, meta: { ...prev.meta, [k]: val === '' ? undefined : val } }))

  const category = useMemo(
    () => lookups.categories.find(c => c.id === v.category_id) ?? null,
    [lookups.categories, v.category_id],
  )
  const slug = category?.slug ?? ''
  const isLink = LINK_SLUGS.includes(slug)

  // No effect syncing `v` from `initial`: the caller passes a `key` derived from
  // the row id, so switching targets remounts this component with fresh state.
  // That also keeps "save and add another" working — the key stays 'new' across
  // consecutive saves, so the retained fields survive.

  // Numeric text → number | null. '' means "not recorded", which for tax is
  // meaningfully different from 0 (see migration 072).
  function num(s: string): number | null {
    const t = s.trim()
    if (t === '') return null
    const n = Number(t)
    return Number.isFinite(n) ? n : NaN
  }

  async function submit(keepOpen: boolean) {
    if (saving) return
    setError(null)
    setFieldErrors({})

    const amount = num(v.amount_usd)
    if (amount === null || Number.isNaN(amount)) {
      setError('Amount is required'); setFieldErrors({ amount_usd: ['Enter an amount'] }); return
    }
    if (!v.category_id) {
      setError('Category is required'); setFieldErrors({ category_id: ['Pick a category'] }); return
    }
    const tax = num(v.tax_usd)
    const initialPrice = num(v.initial_price_usd)
    if (Number.isNaN(tax) || Number.isNaN(initialPrice)) { setError('Tax and initial price must be numbers'); return }

    // Strip undefined keys so `meta` stays tidy rather than accumulating nulls.
    const meta = Object.fromEntries(Object.entries(v.meta).filter(([, val]) => val !== undefined && val !== ''))

    const payload = {
      expense_date: v.expense_date,
      amount_usd: amount,
      tax_usd: tax,
      initial_price_usd: initialPrice,
      category_id: v.category_id,
      subscription_id: v.subscription_id || null,
      backlink_type_id: v.backlink_type_id || null,
      vendor_id: v.vendor_id || null,
      team_id: v.team_id || null,
      vertical_id: v.vertical_id || null,
      link_url: v.link_url,
      link_site: v.link_site,
      link_rel: v.link_rel || null,
      payee: v.payee,
      acquired_by: v.acquired_by,
      country: v.country,
      payment_status: v.payment_status,
      payment_method: v.payment_method || null,
      invoice_url: v.invoice_url,
      description: v.description,
      notes: v.notes,
      meta,
    }

    setSaving(true)
    try {
      const res = await fetch(isEdit ? `/api/expenses/${initial!.id}` : '/api/expenses', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not save')
        if (data.fields) setFieldErrors(data.fields)
        return
      }

      if (keepOpen) {
        // Keep date, category, team and vertical — consecutive entries in a
        // weekly batch nearly always share them. Clear the row-specific fields.
        setV(prev => ({
          ...emptyValues(),
          expense_date: prev.expense_date,
          category_id: prev.category_id,
          team_id: prev.team_id,
          vertical_id: prev.vertical_id,
          payment_status: prev.payment_status,
          payment_method: prev.payment_method,
          // Deliberately NOT carried over: the next entry is a different charge,
          // and silently re-linking it to the same subscription would be wrong.
          subscription_id: null,
          subscription_name: null,
        }))
        setJustSaved(`Saved ${data.total_usd != null ? `$${Number(data.total_usd).toFixed(2)}` : ''}`.trim())
        setTimeout(() => setJustSaved(null), 2500)
      }
      onSaved({ keepOpen })
    } catch (err) {
      console.error(err)
      setError('Connection error saving expense')
    } finally {
      setSaving(false)
    }
  }

  const fe = (k: string) => fieldErrors[k]?.[0]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-3xl shadow-xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {isEdit ? 'Edit expense' : v.subscription_name ? 'Log a charge' : 'Add expense'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {v.subscription_name
                ? `Against ${v.subscription_name}${category ? ` · ${category.name}` : ''}`
                : category?.name}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={e => { e.preventDefault(); submit(false) }} className="px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg text-red-600 dark:text-red-400 text-xs font-medium">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}
          {justSaved && (
            <div className="p-3 bg-green-50 dark:bg-green-950/40 border border-green-100 dark:border-green-900 rounded-lg text-green-700 dark:text-green-400 text-xs font-medium">
              {justSaved} — form ready for the next entry.
            </div>
          )}

          {/* Core */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={label}>Date *</label>
              <input type="date" value={v.expense_date} onChange={e => set('expense_date', e.target.value)} className={field} />
              {fe('expense_date') && <p className="text-xs text-red-600 mt-1">{fe('expense_date')}</p>}
            </div>
            <div>
              <label className={label}>Category *</label>
              <Select value={v.category_id} onChange={val => set('category_id', val)} options={lookups.categories} placeholder="Select…" />
              {fe('category_id') && <p className="text-xs text-red-600 mt-1">{fe('category_id')}</p>}
            </div>
            <div>
              <label className={label}>Amount (USD) *</label>
              <input
                type="number" step="0.01" min="0" inputMode="decimal"
                value={v.amount_usd} onChange={e => set('amount_usd', e.target.value)}
                placeholder="0.00" className={cn(field, 'tabular-nums')}
              />
              {fe('amount_usd') && <p className="text-xs text-red-600 mt-1">{fe('amount_usd')}</p>}
            </div>
            <div>
              <label className={label}>Tax (USD)</label>
              <input
                type="number" step="0.01" min="0" inputMode="decimal"
                value={v.tax_usd} onChange={e => set('tax_usd', e.target.value)}
                placeholder="blank = not recorded" className={cn(field, 'tabular-nums')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={label}>Vendor</label>
              <VendorCombobox
                vendors={lookups.vendors}
                value={v.vendor_id}
                onChange={id => set('vendor_id', id)}
                onVendorCreated={nv => onLookupsChanged({
                  ...lookups,
                  vendors: [...lookups.vendors, nv].sort((a, b) => a.name.localeCompare(b.name)),
                })}
              />
            </div>
            <div>
              <label className={label}>Team</label>
              <Select value={v.team_id} onChange={val => set('team_id', val)} options={lookups.teams} placeholder="—" />
            </div>
            <div>
              <label className={label}>Vertical</label>
              <Select value={v.vertical_id} onChange={val => set('vertical_id', val)} options={lookups.verticals} placeholder="—" />
            </div>
            <div>
              <label className={label}>Status</label>
              <select value={v.payment_status} onChange={e => set('payment_status', e.target.value)} className={field}>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="refunded">Refunded</option>
                <option value="free">Free</option>
              </select>
            </div>
          </div>

          <div>
            <label className={label}>Description</label>
            <input
              value={v.description} onChange={e => set('description', e.target.value)}
              placeholder="What this payment was for" className={field}
            />
          </div>

          {/* Link block — only for Paid Links / HARO Links */}
          {isLink && (
            <div className="rounded-xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20 p-4 space-y-3">
              <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 uppercase tracking-wide">Link details</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className={label}>Link type</label>
                  <Select value={v.backlink_type_id} onChange={val => set('backlink_type_id', val)} options={lookups.backlinkTypes} placeholder="—" />
                </div>
                <div>
                  <label className={label}>Link result</label>
                  <select value={v.link_rel} onChange={e => set('link_rel', e.target.value)} className={field}>
                    <option value="">—</option>
                    <option value="dofollow">Dofollow</option>
                    <option value="nofollow">Nofollow</option>
                    <option value="text_mention">Text mention (no link)</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Initial price (USD)</label>
                  <input
                    type="number" step="0.01" min="0" inputMode="decimal"
                    value={v.initial_price_usd} onChange={e => set('initial_price_usd', e.target.value)}
                    placeholder="pre-negotiation" className={cn(field, 'tabular-nums')}
                  />
                </div>
                <div>
                  <label className={label}>Acquired by</label>
                  <input value={v.acquired_by} onChange={e => set('acquired_by', e.target.value)} placeholder="e.g. Sahana" className={field} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={label}>Publisher site</label>
                  <input value={v.link_site} onChange={e => set('link_site', e.target.value)} placeholder="https://example.com" className={field} />
                </div>
                <div>
                  <label className={label}>Live link</label>
                  <input value={v.link_url} onChange={e => set('link_url', e.target.value)} placeholder="https://example.com/the-post" className={field} />
                </div>
              </div>

              <DuplicateWarning linkUrl={v.link_url} linkSite={v.link_site} excludeId={initial?.id} />

              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {([['da', 'DA'], ['pa', 'PA'], ['ss', 'SS']] as const).map(([k, lbl]) => (
                  <div key={k}>
                    <label className={label}>{lbl}</label>
                    <input
                      type="number" min="0"
                      value={(v.meta[k] as number | undefined) ?? ''}
                      onChange={e => setMeta(k, e.target.value === '' ? '' : Number(e.target.value))}
                      className={cn(field, 'tabular-nums')}
                    />
                  </div>
                ))}
                <div>
                  <label className={label}>Traffic</label>
                  <input value={(v.meta.traffic as string) ?? ''} onChange={e => setMeta('traffic', e.target.value)} placeholder="1.6M" className={field} />
                </div>
                <div className="col-span-2">
                  <label className={label}>Target keyword</label>
                  <input value={(v.meta.target_keyword as string) ?? ''} onChange={e => setMeta('target_keyword', e.target.value)} className={field} />
                </div>
              </div>
            </div>
          )}

          {/* GMB */}
          {(slug === 'gmb-profile' || slug === 'gmb-review') && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className={label}>Country</label>
                <input value={v.country} onChange={e => set('country', e.target.value)} placeholder="e.g. Canada" className={field} />
              </div>
              {slug === 'gmb-review' && (
                <div>
                  <label className={label}>Reviews count</label>
                  <input
                    type="number" min="0"
                    value={(v.meta.reviews_count as number | undefined) ?? ''}
                    onChange={e => setMeta('reviews_count', e.target.value === '' ? '' : Number(e.target.value))}
                    className={cn(field, 'tabular-nums')}
                  />
                </div>
              )}
            </div>
          )}

          {/* Paid Ads */}
          {slug === 'paid-ads' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2">
                <label className={label}>Campaign</label>
                <input value={(v.meta.campaign as string) ?? ''} onChange={e => setMeta('campaign', e.target.value)} className={field} />
              </div>
              <div>
                <label className={label}>Strategy</label>
                <input value={(v.meta.ad_strategy as string) ?? ''} onChange={e => setMeta('ad_strategy', e.target.value)} placeholder="CPC / CPA" className={field} />
              </div>
              <div>
                <label className={label}>Period covered</label>
                <div className="flex gap-1">
                  <input type="date" value={(v.meta.period_start as string) ?? ''} onChange={e => setMeta('period_start', e.target.value)} className={field} />
                  <input type="date" value={(v.meta.period_end as string) ?? ''} onChange={e => setMeta('period_end', e.target.value)} className={field} />
                </div>
              </div>
            </div>
          )}

          {/* Content Writer */}
          {slug === 'content-writer' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className={label}>Article title</label>
                <input value={(v.meta.article_title as string) ?? ''} onChange={e => setMeta('article_title', e.target.value)} className={field} />
              </div>
              <div>
                <label className={label}>Cluster</label>
                <input value={(v.meta.article_cluster as string) ?? ''} onChange={e => setMeta('article_cluster', e.target.value)} className={field} />
              </div>
            </div>
          )}

          {/* Courses */}
          {slug === 'courses' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className={label}>Course</label>
                <input value={(v.meta.course_name as string) ?? ''} onChange={e => setMeta('course_name', e.target.value)} className={field} />
              </div>
              <div>
                <label className={label}>Set</label>
                <input value={(v.meta.set as string) ?? ''} onChange={e => setMeta('set', e.target.value)} placeholder="SET 1" className={field} />
              </div>
            </div>
          )}

          {/* Everything else, collapsed by default to keep batch entry fast */}
          <div>
            <button
              type="button"
              onClick={() => setShowMore(s => !s)}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white"
            >
              {showMore ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              More details
            </button>

            {showMore && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={label}>Paid to</label>
                  <input value={v.payee} onChange={e => set('payee', e.target.value)} placeholder="Freelancer / publisher" className={field} />
                </div>
                <div>
                  <label className={label}>Payment method</label>
                  <select value={v.payment_method} onChange={e => set('payment_method', e.target.value)} className={field}>
                    <option value="">—</option>
                    <option value="auto_pay">Auto pay</option>
                    <option value="manual">Manual</option>
                    <option value="link_exchange">Link exchange</option>
                  </select>
                </div>
                {!isLink && (
                  <div>
                    <label className={label}>Initial price (USD)</label>
                    <input
                      type="number" step="0.01" min="0" inputMode="decimal"
                      value={v.initial_price_usd} onChange={e => set('initial_price_usd', e.target.value)}
                      className={cn(field, 'tabular-nums')}
                    />
                  </div>
                )}
                <div className="md:col-span-3">
                  <label className={label}>Invoice URL</label>
                  <input value={v.invoice_url} onChange={e => set('invoice_url', e.target.value)} placeholder="https://drive.google.com/…" className={field} />
                </div>
                <div className="md:col-span-3">
                  <label className={label}>Notes</label>
                  <textarea
                    rows={2} value={v.notes} onChange={e => set('notes', e.target.value)}
                    placeholder="Anything worth remembering — never passwords" className={field}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              Cancel
            </button>
            {!isEdit && (
              <button
                type="button" onClick={() => submit(true)} disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 rounded-lg disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Save and add another
              </button>
            )}
            <button
              type="submit" disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-gray-900 dark:bg-blue-600 hover:bg-gray-800 dark:hover:bg-blue-700 rounded-lg disabled:opacity-50 shadow-sm"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? 'Save changes' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
