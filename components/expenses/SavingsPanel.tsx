'use client'

interface VendorSaving { name: string; asked: number; paid: number; saved: number; rate: number; count: number }

interface Savings {
  asked: number
  paid: number
  saved: number
  rate: number
  rowsWithBothPrices: number
  byVendor: VendorSaving[]
  avoided: { total: number; count: number }
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

// Negotiated savings. "Before → after per item" is a dumbbell (choosing-a-form),
// so each vendor is one track with two ends: the ask and what was actually paid.
// Two shades of ONE hue rather than two hues — this is the same measure at two
// points in time, not two identities.
export default function SavingsPanel({ savings, scopeLabel }: { savings: Savings; scopeLabel: string }) {
  const { asked, paid, saved, rate, rowsWithBothPrices, byVendor, avoided } = savings
  const max = Math.max(0, ...byVendor.map(v => v.asked))
  const nothing = rowsWithBothPrices === 0 && avoided.count === 0

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Savings against asking price</h2>
      <p className="text-xs text-gray-500">
        {scopeLabel} · {rowsWithBothPrices.toLocaleString()} {rowsWithBothPrices === 1 ? 'entry' : 'entries'} recorded both an asking price and what was paid
      </p>

      {nothing ? (
        <p className="text-sm text-gray-500 py-6 text-center">
          No entries in this period recorded an asking price.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mt-3 mb-4">
            <div>
              <p className="text-xs text-gray-500">Negotiated down</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{money(saved)}</p>
              <p className="text-xs text-gray-500 tabular-nums">
                {money(asked)} asked → {money(paid)} paid · {(rate * 100).toFixed(1)}% off
              </p>
            </div>
            {avoided.count > 0 && (
              <div>
                <p className="text-xs text-gray-500">Avoided entirely</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{money(avoided.total)}</p>
                {/* Kept separate from the discount rate on purpose: a link
                    exchange is barter, not a negotiated price. */}
                <p className="text-xs text-gray-500">
                  {avoided.count} link {avoided.count === 1 ? 'exchange or free placement' : 'exchanges and free placements'}
                </p>
              </div>
            )}
          </div>

          {byVendor.length > 0 && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
                Biggest savings by counterparty
              </p>
              {/* Legend: two ends of one track, so identity is never colour-alone */}
              {/* Legend, and the scale the bar lengths are relative to */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-[11px] text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-2.5 rounded-sm" style={{ background: 'var(--viz-accent)' }} />
                  Paid
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-2.5 rounded-sm" style={{ background: 'var(--viz-saved)' }} />
                  Saved
                </span>
                <span className="text-gray-400">
                  full bar = asking price, largest {money(max)}
                </span>
              </div>

              <ul className="space-y-2.5">
                {byVendor.map(v => {
                  // Both segments measured from a shared zero baseline, so the
                  // bars are directly comparable row to row and the saving is
                  // visible as the pale tail. A dumbbell showed only the interval
                  // and, with no axis behind it, the dot positions read as noise.
                  const askPct = max > 0 ? (v.asked / max) * 100 : 0
                  const paidShare = v.asked > 0 ? v.paid / v.asked : 0
                  return (
                    <li key={v.name}>
                      <div className="flex items-baseline justify-between gap-3 mb-1">
                        <span className="text-xs text-gray-700 dark:text-gray-300 truncate" title={v.name}>{v.name}</span>
                        <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">
                          saved {money(v.saved)}
                          <span className="ml-1.5 font-normal text-gray-400">{(v.rate * 100).toFixed(0)}%</span>
                        </span>
                      </div>

                      {/* One bar the width of the ask, split paid | saved with a
                          2px surface gap doing the separating — never a border. */}
                      <div
                        className="flex h-2.5 gap-[2px]"
                        style={{ width: `${Math.max(askPct, 1)}%` }}
                        title={`${v.name}\nAsked ${money(v.asked)} · paid ${money(v.paid)} · saved ${money(v.saved)}\n${v.count} ${v.count === 1 ? 'entry' : 'entries'}`}
                      >
                        <div
                          className="rounded-l-sm"
                          style={{ width: `${paidShare * 100}%`, background: 'var(--viz-accent)' }}
                        />
                        <div
                          className="flex-1 rounded-r-sm"
                          style={{ background: 'var(--viz-saved)' }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}
