'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, ArrowDown, ArrowUp, Loader2, Minus } from 'lucide-react'
import BreakdownBars, { type Bar } from '@/components/expenses/BreakdownBars'
import CategoryMatrix from '@/components/expenses/CategoryMatrix'
import RenewalAlertBanner from '@/components/expenses/RenewalAlertBanner'
import RenewalsWidget from '@/components/expenses/RenewalsWidget'
import SavingsPanel from '@/components/expenses/SavingsPanel'
import SpendTrend from '@/components/expenses/SpendTrend'
import { cn } from '@/lib/utils'

interface Summary {
  empty: boolean
  years: number[]
  year: number
  anchor: { year: number; month: number }
  isLatestYear: boolean
  categories: { id: string; name: string; sort_order: number }[]
  matrix: { month: number; cells: { category_id: string; total: number; net: number; tax: number; count: number }[]; row_total: number; row_net: number; row_count: number }[]
  yearTotals: { byCategory: { category_id: string; total: number }[]; total: number; net: number }
  kpis: {
    thisMonth: { total: number; net: number }
    lastMonth: { total: number; net: number }
    momPct: number | null
    ytd: { total: number; net: number }
    ytdPrior: { total: number; net: number }
    yoyPct: number | null
    grand: { total: number; net: number; tax: number }
  } | null
  trend: { year: number; month: number; label: string; total: number; net: number }[]
  trendPrior: { year: number; month: number; label: string; total: number; net: number }[]
  hasPrior: boolean
}

interface Breakdowns {
  byTeam: Bar[]
  byVertical: Bar[]
  byVendor: Bar[]
  byBacklinkType: Bar[]
  savings: {
    asked: number; paid: number; saved: number; rate: number
    rowsWithBothPrices: number
    byVendor: { name: string; asked: number; paid: number; saved: number; rate: number; count: number }[]
    avoided: { total: number; count: number }
  }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

// Stat tile. Proportional figures on the value — tabular-nums makes a large
// standalone number look loose (marks-and-anatomy.md).
//
// The delta stays in secondary ink with an arrow rather than green/red. For a
// spend dashboard "up" is not inherently bad — a planned campaign month should
// not be coloured like a failure — so the arrow and the named period carry the
// meaning and the reader supplies the judgement.
function StatTile({ label, value, sub, pct, pctLabel }: {
  label: string
  value: string
  sub?: string
  pct?: number | null
  pctLabel?: string
}) {
  const dir = pct == null ? null : pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 shadow-sm">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 dark:text-white mt-0.5">{value}</p>
      {(sub || dir) && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
          {dir === 'up' && <ArrowUp size={12} aria-hidden />}
          {dir === 'down' && <ArrowDown size={12} aria-hidden />}
          {dir === 'flat' && <Minus size={12} aria-hidden />}
          {pct != null && <span className="tabular-nums font-medium">{pct > 0 ? '+' : ''}{pct}%</span>}
          {pctLabel && <span>{pctLabel}</span>}
          {sub && <span>{sub}</span>}
        </p>
      )}
    </div>
  )
}

export default function DashboardClient() {
  const [data, setData] = useState<Summary | null>(null)
  const [breakdowns, setBreakdowns] = useState<Breakdowns | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [useNet, setUseNet] = useState(false)
  const [compare, setCompare] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      setError(null)
      try {
        const qs = year ? `?year=${year}` : ''
        const [sRes, bRes] = await Promise.all([
          fetch(`/api/expenses/summary${qs}`, { cache: 'no-store' }),
          fetch(`/api/expenses/breakdowns${qs}`, { cache: 'no-store' }),
        ])
        const body = await sRes.json()
        const bBody = await bRes.json()
        if (cancelled) return
        if (!sRes.ok) { setError(body.error || 'Failed to load the dashboard'); return }
        setData(body)
        if (bRes.ok) setBreakdowns(bBody)
        if (year === null && typeof body.year === 'number') setYear(body.year)
      } catch (err) {
        console.error(err)
        if (!cancelled) setError('Connection error loading the dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [year])

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg text-red-600 dark:text-red-400 text-xs font-medium">
        <AlertCircle size={14} />
        {error}
      </div>
    )
  }

  if (!data && loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-[88px] bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)}
        </div>
        <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (!data || data.empty || !data.kpis) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-12 text-center shadow-sm">
        <p className="text-sm text-gray-500">No expenses recorded yet — the dashboard fills in once the ledger has data.</p>
      </div>
    )
  }

  const k = data.kpis
  const pick = (v: { total: number; net: number }) => (useNet ? v.net : v.total)
  const anchorLabel = `${MONTHS[data.anchor.month - 1]} ${data.anchor.year}`

  return (
    // Viz tokens live in the stylesheet, NOT an inline style attribute: inline
    // custom properties beat every selector, so a `.dark` override could never
    // win and dark mode silently kept the light gridlines and ink.
    //
    // Values are the blue ramp validated against this app's own surfaces
    // (#ffffff / #111827) with scripts/validate_palette.js.
    <div className={cn('viz-root space-y-5 transition-opacity', loading && 'opacity-60')}>
      <style>{`
        .viz-root {
          --viz-accent:   #2a78d6;
          --viz-grid:     #e1e0d9;
          --viz-baseline: #c3c2b7;
          --viz-muted:    #898781;
          --viz-ink:      #0b0b0b;
          --viz-surface:  #ffffff;
          /* Categorical slot 2 for the prior-period overlay, and the paler step
             of the same blue for the "saved" segment. Both validated against
             #ffffff; step 250 is the lightest that clears 2:1 on a light surface. */
          --viz-compare:  #eb6834;
          --viz-saved:    #86b6ef;
        }
        /* This app toggles a "dark" class on the html element; data-theme is
           kept as a fallback for the documented convention. */
        .dark .viz-root, :root[data-theme="dark"] .viz-root {
          --viz-accent:   #3987e5;
          --viz-grid:     #2c2c2a;
          --viz-baseline: #383835;
          --viz-muted:    #898781;
          --viz-ink:      #ffffff;
          --viz-surface:  #111827;
          --viz-compare:  #d95926;
          --viz-saved:    #86b6ef;
        }
      `}</style>

      {/* Urgent renewals sit above everything, including the filters — they are
          not scoped by the year selector because a renewal is about what is
          coming, not which year is on screen. */}
      <RenewalAlertBanner />

      {/* One filter row, above everything it scopes — never inside a chart card */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          {data.years.map(y => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={cn(
                'px-3 py-1 rounded text-sm font-medium tabular-nums transition-colors',
                y === data.year
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200',
              )}
            >
              {y}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
          {([[false, 'Incl. tax'], [true, 'Net of tax']] as const).map(([v, lbl]) => (
            <button
              key={lbl}
              onClick={() => setUseNet(v)}
              className={cn(
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                useNet === v
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200',
              )}
            >
              {lbl}
            </button>
          ))}
        </div>

        {data.hasPrior && (
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={compare}
              onChange={e => setCompare(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
            />
            Compare with a year earlier
          </label>
        )}

        {loading && <Loader2 size={15} className="text-gray-400 animate-spin" />}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label={anchorLabel}
          value={money(pick(k.thisMonth))}
          pct={k.momPct}
          pctLabel="vs previous month"
        />
        <StatTile
          label="Previous month"
          value={money(pick(k.lastMonth))}
        />
        <StatTile
          label={data.isLatestYear ? `${data.year} to date` : `${data.year} total`}
          value={money(pick(k.ytd))}
          pct={k.yoyPct}
          pctLabel={data.isLatestYear
            ? `vs ${data.year - 1} same period`
            : `vs ${data.year - 1}`}
        />
        <StatTile
          label="All time recorded"
          value={money(pick(k.grand))}
          sub={`${data.years[0]}–${data.years[data.years.length - 1]}`}
        />
      </div>

      {/* Trend */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          Total spend, 12 months to {anchorLabel} {useNet && <span className="font-normal text-gray-500">(net of tax)</span>}
        </h2>
        <p className="text-xs text-gray-500 mb-2">
          Reaches back into {data.year - 1} — the window follows the year selected above.
        </p>
        <SpendTrend
          points={data.trend}
          useNet={useNet}
          prior={compare && data.hasPrior ? data.trendPrior : null}
        />
      </div>

      {/* Breakdowns. Each is one series on one colour — a value ramp here would
          double-encode bar length as hue. */}
      {breakdowns && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BreakdownBars
              title="Spend by team"
              subtitle={`${data.year} · company-wide teams, not the app's departments`}
              bars={breakdowns.byTeam}
              useNet={useNet}
            />
            <BreakdownBars
              title="Spend by vertical"
              // Vertical is only recorded on link and content rows, so tools and
              // ad spend land in Unassigned. Saying so beats leaving the reader
              // to wonder why one bar dominates.
              subtitle={`${data.year} · recorded on link and content spend; tools and ads are unattributed`}
              bars={breakdowns.byVertical}
              useNet={useNet}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BreakdownBars
              title="Top counterparties"
              // Tools show as vendors; link spend shows as the publisher domain,
              // since backlink rows carry no vendor. The tail is folded rather
              // than truncated so the bars still add up to the whole.
              subtitle={`${data.year} · vendors and link publishers, 10 largest`}
              bars={breakdowns.byVendor}
              useNet={useNet}
            />
            <BreakdownBars
              title="Link spend by type"
              subtitle={`${data.year} · Paid Links and HARO Links only`}
              bars={breakdowns.byBacklinkType}
              useNet={useNet}
              emptyNote="No link spend recorded in this year."
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SavingsPanel savings={breakdowns.savings} scopeLabel={String(data.year)} />
            {/* Not scoped by the year filter on purpose — a renewal is about what
                is coming up, which has nothing to do with which year is on screen. */}
            <RenewalsWidget />
          </div>
        </>
      )}

      {/* Matrix */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          {data.year} by month and category
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Reproduces the Summary sheet. Shading shows relative size; every figure is readable as text.
        </p>
        <CategoryMatrix
          year={data.year}
          categories={data.categories}
          matrix={data.matrix}
          yearTotals={data.yearTotals}
          useNet={useNet}
        />
      </div>
    </div>
  )
}
