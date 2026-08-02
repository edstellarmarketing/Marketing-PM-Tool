import Link from 'next/link'
import { publicReportPath } from '@/lib/expense-constants'

// Shared chrome for the tokenised public report. Server components only — this
// page has no session, so it also has no client-side state worth shipping.

export type PublicView = 'overview' | 'ledger' | 'subscriptions'

const TABS: { key: PublicView; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'ledger', label: 'Ledger' },
  { key: 'subscriptions', label: 'Subscriptions' },
]

export function PublicNav({ token, view }: { token: string; view: PublicView }) {
  return (
    <nav className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
      {TABS.map(t => (
        <Link
          key={t.key}
          href={`${publicReportPath(token)}${t.key === 'overview' ? '' : `?view=${t.key}`}`}
          className={
            t.key === view
              ? 'px-3 py-1.5 rounded-md text-sm font-semibold bg-white text-gray-900 shadow-sm'
              : 'px-3 py-1.5 rounded-md text-sm font-medium text-gray-500 hover:text-gray-900'
          }
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}

export function PublicHeader({ generated }: { generated: string }) {
  return (
    <header>
      <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">Edstellar</p>
      <h1 className="text-2xl font-bold text-gray-900 mt-1">Spend report</h1>
      <p className="text-sm text-gray-500 mt-1">
        All years · generated {generated} · figures in USD · read-only
      </p>
    </header>
  )
}

export function PublicFooter() {
  return (
    <p className="text-xs text-gray-400 text-center pb-6">
      Read-only view. This link was shared deliberately and needs no sign-in —
      please don&apos;t forward it outside the company.
    </p>
  )
}

export function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-0.5">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}

// The validated 4-step blue ordinal ramp used by the in-app matrix. Zero gets no
// fill, so an empty cell never reads as a small amount.
export function heatBin(value: number, max: number) {
  if (value === 0 || max <= 0) return null
  const f = Math.abs(value) / max
  if (f >= 0.6) return { bg: '#0d366b', fg: '#ffffff' }
  if (f >= 0.3) return { bg: '#1c5cab', fg: '#ffffff' }
  if (f >= 0.1) return { bg: '#3987e5', fg: '#ffffff' }
  return { bg: '#86b6ef', fg: '#0b0b0b' }
}
