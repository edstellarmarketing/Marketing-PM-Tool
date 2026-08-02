'use client'

export interface Bar { id: string; name: string; total: number; net: number; count: number }

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const exact = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

// Horizontal bars: one series, so ONE colour for every bar. Shading them
// darker-where-bigger would double-encode length as hue and burn the only free
// channel on information the bar already shows (anti-patterns.md).
//
// Horizontal rather than vertical because the labels are long names
// ("LinkedIn Sales Navigator (Vrisha Mam)") — going vertical would force
// rotated ticks.
export default function BreakdownBars({
  title, subtitle, bars, useNet, emptyNote,
}: {
  title: string
  subtitle?: string
  bars: Bar[]
  useNet: boolean
  emptyNote?: string
}) {
  const val = (b: Bar) => (useNet ? b.net : b.total)
  const rows = bars.filter(b => Math.abs(val(b)) > 0.005)
  const max = Math.max(0, ...rows.map(b => Math.abs(val(b))))
  const grand = rows.reduce((a, b) => a + val(b), 0)

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500 mb-3">{subtitle}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">{emptyNote ?? 'Nothing recorded for this period.'}</p>
      ) : (
        <ul className="space-y-2 mt-1">
          {rows.map(b => {
            const v = val(b)
            const pctOfMax = max > 0 ? (Math.abs(v) / max) * 100 : 0
            const share = grand !== 0 ? (v / grand) * 100 : 0
            return (
              <li key={b.id}>
                <div className="flex items-baseline justify-between gap-3 mb-0.5">
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate" title={b.name}>
                    {b.name}
                  </span>
                  {/* Value at the tip of the bar's row, in ink — text never wears
                      the series colour. */}
                  <span
                    className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums whitespace-nowrap"
                    title={`${exact(v)} across ${b.count} ${b.count === 1 ? 'entry' : 'entries'}`}
                  >
                    {money(v)}
                    <span className="ml-1.5 font-normal text-gray-400">{share.toFixed(0)}%</span>
                  </span>
                </div>
                {/* Track is a hairline wash; the bar itself is thin, with a 4px
                    rounded data-end and a square start at the baseline. */}
                <div className="h-2 rounded-sm bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-r-[4px]"
                    style={{ width: `${Math.max(pctOfMax, 0.8)}%`, background: 'var(--viz-accent)' }}
                    role="img"
                    aria-label={`${b.name}: ${money(v)}, ${share.toFixed(0)} percent of the total`}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
