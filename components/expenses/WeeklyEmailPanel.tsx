'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Check, Loader2, Mail, Send, Trash2, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Recipient { user_id: string; full_name: string; designation: string | null }
interface Eligible { id: string; full_name: string; designation: string | null; role: string }

// Week arithmetic in UTC. A local-time Date would shift the boundary by a day
// for anyone east of UTC, quietly reporting on the wrong week.
const iso = (d: Date) => d.toISOString().slice(0, 10)
const todayIso = () => iso(new Date())

/** Monday of the week containing `date` — the picker accepts any day in it. */
function weekStart(date: string) {
  const d = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return date
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return iso(d)
}

function weekEnd(date: string) {
  const d = new Date(`${weekStart(date)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return date
  d.setUTCDate(d.getUTCDate() + 6)
  return iso(d)
}

export default function WeeklyEmailPanel() {
  const [enabled, setEnabled] = useState(false)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [eligible, setEligible] = useState<Eligible[]>([])
  const [selected, setSelected] = useState('')
  // Empty = last week, which is what the Monday cron sends.
  const [week, setWeek] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const [s, r] = await Promise.all([
          fetch('/api/expenses/weekly-email', { cache: 'no-store' }).then(x => x.json()),
          fetch('/api/expenses/report-recipients', { cache: 'no-store' }).then(x => x.json()),
        ])
        if (cancelled) return
        if (!s.error) setEnabled(!!s.enabled)
        if (!r.error) { setRecipients(r.recipients ?? []); setEligible(r.eligible ?? []) }
      } catch {
        if (!cancelled) setError('Connection error loading email settings')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [reloadKey])

  async function call(url: string, init: RequestInit, okMsg?: string) {
    setBusy(true); setError(null); setNotice(null)
    try {
      const res = await fetch(url, init)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(typeof body.error === 'string' ? body.error : 'Failed'); return false }
      if (okMsg) setNotice(okMsg)
      setReloadKey(k => k + 1)
      return true
    } finally {
      setBusy(false)
    }
  }

  const weekBody = () => (week ? { start: weekStart(week), end: weekEnd(week) } : {})

  const already = new Set(recipients.map(r => r.user_id))
  const addable = eligible.filter(e => !already.has(e.id))

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
      <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <Mail size={18} className="text-blue-500" />
        Weekly spend email
      </h2>
      <p className="text-xs text-gray-500 mt-0.5 mb-4">
        Sent every Monday morning with last week&apos;s spend, links acquired, anything
        unpaid, what is renewing next, and the year to date.
      </p>

      {error && (
        <div className="mb-3 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg text-red-600 dark:text-red-400 text-xs font-medium">
          <AlertCircle size={14} />{error}
        </div>
      )}
      {notice && (
        <div className="mb-3 flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900 rounded-lg text-green-700 dark:text-green-400 text-xs font-medium">
          <Check size={14} />{notice}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={() => call('/api/expenses/weekly-email', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: !enabled }),
          })}
          disabled={busy || loading}
          className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50',
            enabled ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-900 dark:bg-blue-600 hover:bg-gray-800 dark:hover:bg-blue-700 text-white')}
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {enabled ? 'Turn off weekly email' : 'Turn on weekly email'}
        </button>
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
          enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400')}>
          {enabled ? 'on' : 'off'}
        </span>
        <button
          onClick={() => call('/api/expenses/weekly-email', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'test', ...weekBody() }),
          }, `Test email sent to you only${week ? ` for the week of ${week}` : ''} — recipients were not included.`)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg disabled:opacity-50"
        >
          <Send size={14} />
          Send me a test
        </button>
      </div>

      {/* Any past week, not just the last one — the template only shows links or
          unpaid invoices when the week actually had some, so checking it against
          a quiet week tells you very little. */}
      <div className="flex flex-wrap items-end gap-2 mb-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <label className="text-xs text-gray-500">
          <span className="block mb-1">Report on the week starting (Monday)</span>
          <input
            type="date" name="report-week" value={week} max={todayIso()}
            onChange={e => setWeek(e.target.value)}
            className="text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 dark:text-white rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <a
          href={`/api/expenses/weekly-email?preview=1${week ? `&start=${weekStart(week)}&end=${weekEnd(week)}` : ''}`}
          target="_blank" rel="noreferrer"
          className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg"
        >
          Preview in browser
        </a>
        {week && (
          <button onClick={() => setWeek('')}
            className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
            Clear
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">
          {week ? `${weekStart(week)} → ${weekEnd(week)}` : 'Defaults to last week'}
        </span>
      </div>

      {/* The rule worth stating on screen, not just enforcing in the API. */}
      <p className="text-xs text-gray-500 mb-2">
        Recipients must already have access to Expenses — the email carries real
        figures. Grant someone access above first, then add them here.
      </p>

      <div className="flex gap-2 mb-4">
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          disabled={busy || addable.length === 0}
          className="flex-1 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 dark:text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60"
        >
          <option value="">
            {addable.length === 0 ? 'Everyone with access already receives it' : 'Add someone with access…'}
          </option>
          {addable.map(e => (
            <option key={e.id} value={e.id}>
              {e.full_name}{e.designation ? ` — ${e.designation}` : ''} ({e.role})
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            if (!selected) return
            call('/api/expenses/report-recipients', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ user_id: selected }),
            }).then(ok => { if (ok) setSelected('') })
          }}
          disabled={!selected || busy}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 dark:bg-blue-600 hover:bg-gray-800 dark:hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
        >
          <UserPlus size={14} />
          Add
        </button>
      </div>

      {loading ? (
        <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      ) : recipients.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">
          Nobody receives it yet{enabled ? ' — the Monday send will be skipped.' : '.'}
        </p>
      ) : (
        <ul className="divide-y divide-gray-50 dark:divide-gray-800">
          {recipients.map(r => (
            <li key={r.user_id} className="flex items-center gap-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-white truncate">{r.full_name}</p>
                {r.designation && <p className="text-xs text-gray-400 truncate">{r.designation}</p>}
              </div>
              <button
                onClick={() => call(`/api/expenses/report-recipients?user_id=${r.user_id}`, { method: 'DELETE' })}
                title="Stop sending to this person"
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
