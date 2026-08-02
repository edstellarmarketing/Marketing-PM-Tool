'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Copy, Globe, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { publicReportPath } from '@/lib/expense-constants'

interface Token { token: string; enabled: boolean; rotated_at: string }

export default function PublicReportPanel() {
  const [data, setData] = useState<Token | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const res = await fetch('/api/expenses/public-report', { cache: 'no-store' })
        const body = await res.json()
        if (cancelled) return
        if (res.ok) setData(body)
        else setError(body.error || 'Failed to load')
      } catch {
        if (!cancelled) setError('Connection error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [reloadKey])

  async function act(action: 'enable' | 'disable' | 'rotate') {
    if (action === 'rotate' && !window.confirm('Rotate the link?\n\nThe current URL stops working immediately and anyone who needs the report will have to be sent the new one.')) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/expenses/public-report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = await res.json()
      if (!res.ok) { setError(typeof body.error === 'string' ? body.error : 'Failed'); return }
      setReloadKey(k => k + 1)
    } finally {
      setBusy(false)
    }
  }

  const url = data ? `${typeof window !== 'undefined' ? window.location.origin : ''}${publicReportPath(data.token)}` : ''

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-sm">
      <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <Globe size={18} className="text-blue-500" />
        Public report link
      </h2>
      <p className="text-xs text-gray-500 mt-0.5">
        A read-only summary that opens without a login, for sharing outside the app.
      </p>

      {/* This is the one place the module's everything-behind-auth rule is
          broken, so say plainly what that means rather than burying it. */}
      <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-lg text-xs text-amber-900 dark:text-amber-200">
        <AlertTriangle size={14} className="mt-px flex-shrink-0" />
        <span>
          Anyone holding this URL can read it — no sign-in, no account. Links leak
          through forwarded email and browser history, so treat it as public.
          It shows <strong>the full report, read-only</strong>: every year, and the
          complete ledger and subscriptions — individual entries, vendors, link URLs,
          negotiated prices, invoice links and notes included. Settings, the recycle
          bin and this page are not reachable from it. Rotate the link if it reaches
          anyone it should not.
        </span>
      </div>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {loading ? (
        <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse mt-4" />
      ) : data ? (
        <>
          <div className="mt-4 flex items-center gap-2">
            <code className={cn(
              'flex-1 text-xs px-3 py-2 rounded-lg border truncate font-mono',
              data.enabled
                ? 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-400 line-through',
            )}>
              {url}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
              disabled={!data.enabled}
              title="Copy link"
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg disabled:opacity-40"
            >
              {copied ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => act(data.enabled ? 'disable' : 'enable')}
              disabled={busy}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50',
                data.enabled
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-gray-900 dark:bg-blue-600 hover:bg-gray-800 dark:hover:bg-blue-700 text-white',
              )}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {data.enabled ? 'Turn off the link' : 'Turn on the link'}
            </button>
            <button
              onClick={() => act('rotate')}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg disabled:opacity-50"
            >
              <RefreshCw size={14} />
              Rotate
            </button>
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
              data.enabled
                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400')}>
              {data.enabled ? 'live' : 'off'}
            </span>
            <span className="text-xs text-gray-400">
              last rotated {new Date(data.rotated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </>
      ) : null}
    </div>
  )
}
