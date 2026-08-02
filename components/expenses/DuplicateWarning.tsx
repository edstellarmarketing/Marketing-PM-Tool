'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Info } from 'lucide-react'

interface Match {
  id: string
  expense_date: string
  amount_usd: number
  total_usd: number
  link_url: string | null
  link_domain: string | null
  payment_status: string
  description: string | null
  vertical_name: string | null
  backlink_type_name: string | null
  created_by_name: string | null
}

interface Result {
  domain: string | null
  exact: Match[]
  domainMatches: Match[]
  exactTotal: number
  domainTotal: number
}

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

function fmt(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Advisory only. This never disables the save button and never asks for
// confirmation — recording the same link twice is legitimate (a second
// placement, a renewal, a re-buy). It exists so the decision is informed.
export default function DuplicateWarning({
  linkUrl, linkSite, excludeId,
}: {
  linkUrl: string
  linkSite: string
  excludeId?: string
}) {
  const [result, setResult] = useState<Result | null>(null)

  const url = linkUrl.trim()
  const site = linkSite.trim()
  const hasInput = Boolean(url || site)

  useEffect(() => {
    if (!hasInput) return

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const p = new URLSearchParams()
        if (url) p.set('link_url', url)
        if (site) p.set('link_site', site)
        if (excludeId) p.set('excludeId', excludeId)
        const res = await fetch(`/api/expenses/duplicates?${p}`, { cache: 'no-store' })
        const data = await res.json()
        if (cancelled || !res.ok) return
        setResult(data)
      } catch {
        // A failed advisory lookup must never get in the way of saving.
      }
    }, 400)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [url, site, excludeId, hasInput])

  // Guarded at render rather than by clearing state in the effect: clearing the
  // link field hides a stale warning immediately instead of 400ms later.
  if (!hasInput || !result) return null
  const { exact, domainMatches, exactTotal, domainTotal, domain } = result
  if (exactTotal === 0 && domainTotal === 0) return null

  const isExact = exactTotal > 0
  const shown = isExact ? exact : domainMatches
  const total = isExact ? exactTotal : domainTotal

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${
      isExact
        ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20'
        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40'
    }`}>
      <p className={`text-xs font-semibold flex items-start gap-1.5 ${
        isExact ? 'text-amber-900 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'
      }`}>
        <Info size={14} className="mt-px flex-shrink-0" />
        <span>
          {isExact
            ? `This exact link is already recorded — ${exactTotal} ${exactTotal === 1 ? 'entry' : 'entries'}.`
            : `${domainTotal} existing ${domainTotal === 1 ? 'entry' : 'entries'} for ${domain}.`}
          <span className="font-normal"> You can still save this — check it is not a duplicate.</span>
        </span>
      </p>

      <ul className="divide-y divide-black/5 dark:divide-white/10">
        {shown.map(m => (
          <li key={m.id} className="py-1.5 flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0">
              <span className="text-gray-500 tabular-nums">{fmt(m.expense_date)}</span>
              <span className="text-gray-700 dark:text-gray-300"> · {m.description || m.link_domain}</span>
              {(m.backlink_type_name || m.vertical_name) && (
                <span className="text-gray-400">
                  {' '}· {[m.backlink_type_name, m.vertical_name].filter(Boolean).join(' / ')}
                </span>
              )}
              {m.created_by_name && <span className="text-gray-400"> · by {m.created_by_name}</span>}
            </span>
            <span className="flex items-center gap-2 flex-shrink-0">
              <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{usd(m.total_usd)}</span>
              {m.link_url && (
                <a href={m.link_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  <ExternalLink size={11} />
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>

      {total > shown.length && (
        <p className="text-xs text-gray-400">…and {total - shown.length} more.</p>
      )}
    </div>
  )
}
