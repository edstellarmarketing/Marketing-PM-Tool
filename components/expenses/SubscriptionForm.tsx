'use client'

import { useState } from 'react'
import { AlertCircle, Loader2, X } from 'lucide-react'
import VendorCombobox from '@/components/expenses/VendorCombobox'
import { cn } from '@/lib/utils'
import type { ExpenseLookup, ExpenseLookups } from '@/types'

export interface SubscriptionFormValues {
  id?: string
  name: string
  vendor_id: string | null
  billing_cycle: string
  amount_usd: string
  started_on: string
  ends_on: string
  payment_method: string
  status: string
  owner_name: string
  team_id: string
  seats: string
  invoice_url: string
  notes: string
}

export function emptySubscription(): SubscriptionFormValues {
  return {
    name: '', vendor_id: null, billing_cycle: 'monthly', amount_usd: '',
    started_on: '', ends_on: '', payment_method: '', status: 'active',
    owner_name: '', team_id: '', seats: '', invoice_url: '', notes: '',
  }
}

const label = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
const field = 'w-full text-sm bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-800 outline-none transition-all'

// Module scope: a component declared inside render is a new type every pass,
// which resets its state and defeats reconciliation.
function Select({ value, onChange, options, placeholder }: {
  value: string
  onChange: (v: string) => void
  options: ExpenseLookup[]
  placeholder: string
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={field}>
      <option value="">{placeholder}</option>
      {options.filter(o => o.is_active !== false || o.id === value).map(o => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  )
}

export default function SubscriptionForm({
  lookups, initial, onClose, onSaved, onLookupsChanged,
}: {
  lookups: ExpenseLookups
  initial?: SubscriptionFormValues
  onClose: () => void
  onSaved: () => void
  onLookupsChanged: (next: ExpenseLookups) => void
}) {
  const isEdit = Boolean(initial?.id)
  const [v, setV] = useState<SubscriptionFormValues>(initial ?? emptySubscription())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})

  const set = <K extends keyof SubscriptionFormValues>(k: K, val: SubscriptionFormValues[K]) =>
    setV(prev => ({ ...prev, [k]: val }))

  function num(s: string): number | null {
    const t = s.trim()
    if (t === '') return null
    const n = Number(t)
    return Number.isFinite(n) ? n : NaN
  }

  async function submit() {
    if (saving) return
    setError(null); setFieldErrors({})

    if (!v.name.trim()) { setError('Name is required'); setFieldErrors({ name: ['Enter a name'] }); return }
    const amount = num(v.amount_usd)
    const seats = num(v.seats)
    if (Number.isNaN(amount) || Number.isNaN(seats)) { setError('Price and seats must be numbers'); return }

    const payload = {
      name: v.name.trim(),
      vendor_id: v.vendor_id || null,
      billing_cycle: v.billing_cycle,
      amount_usd: amount,
      started_on: v.started_on || null,
      ends_on: v.ends_on || null,
      payment_method: v.payment_method || null,
      status: v.status,
      owner_name: v.owner_name,
      team_id: v.team_id || null,
      seats: seats === null ? null : Math.round(seats),
      invoice_url: v.invoice_url,
      notes: v.notes,
    }

    setSaving(true)
    try {
      const res = await fetch(isEdit ? `/api/expenses/subscriptions/${initial!.id}` : '/api/expenses/subscriptions', {
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
      onSaved()
    } catch {
      setError('Connection error saving the subscription')
    } finally {
      setSaving(false)
    }
  }

  const fe = (k: string) => fieldErrors[k]?.[0]

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-2xl shadow-xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {isEdit ? 'Edit subscription' : 'Add subscription'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              A commitment, not a payment — log charges against it separately.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={e => { e.preventDefault(); submit() }} className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg text-red-600 dark:text-red-400 text-xs font-medium">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className={label}>Name *</label>
              <input value={v.name} onChange={e => set('name', e.target.value)} placeholder="Claude (Edstellar)" className={field} />
              {fe('name') && <p className="text-xs text-red-600 mt-1">{fe('name')}</p>}
            </div>
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
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={label}>Billing cycle *</label>
              <select value={v.billing_cycle} onChange={e => set('billing_cycle', e.target.value)} className={field}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="credits">Credits</option>
                <option value="one_time">One time</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className={label}>Price per cycle</label>
              <input
                type="number" step="0.01" min="0" inputMode="decimal"
                value={v.amount_usd} onChange={e => set('amount_usd', e.target.value)}
                placeholder="0.00" className={cn(field, 'tabular-nums')}
              />
            </div>
            <div>
              <label className={label}>Status</label>
              <select value={v.status} onChange={e => set('status', e.target.value)} className={field}>
                <option value="active">Active</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired</option>
              </select>
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
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={label}>Started</label>
              <input type="date" value={v.started_on} onChange={e => set('started_on', e.target.value)} className={field} />
            </div>
            <div>
              <label className={label}>Renews / expires</label>
              <input type="date" value={v.ends_on} onChange={e => set('ends_on', e.target.value)} className={field} />
              {fe('ends_on') && <p className="text-xs text-red-600 mt-1">{fe('ends_on')}</p>}
            </div>
            <div>
              <label className={label}>Team</label>
              <Select value={v.team_id} onChange={val => set('team_id', val)} options={lookups.teams} placeholder="—" />
            </div>
            <div>
              <label className={label}>Seats</label>
              <input
                type="number" min="1" step="1"
                value={v.seats} onChange={e => set('seats', e.target.value)}
                className={cn(field, 'tabular-nums')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={label}>Responsible person</label>
              <input
                value={v.owner_name} onChange={e => set('owner_name', e.target.value)}
                placeholder="Free text — need not be a platform user" className={field}
              />
            </div>
            <div>
              <label className={label}>Invoice URL</label>
              <input value={v.invoice_url} onChange={e => set('invoice_url', e.target.value)} placeholder="https://drive.google.com/…" className={field} />
            </div>
          </div>

          <div>
            <label className={label}>Notes</label>
            <textarea
              rows={2} value={v.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Plan details, seat breakdown — never passwords" className={field}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-gray-900 dark:bg-blue-600 hover:bg-gray-800 dark:hover:bg-blue-700 rounded-lg disabled:opacity-50 shadow-sm"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {isEdit ? 'Save changes' : 'Add subscription'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
