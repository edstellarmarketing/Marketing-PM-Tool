'use client'

import { cn } from '@/lib/utils'

interface Cell { category_id: string; total: number; net: number; tax: number; count: number }
interface Row { month: number; cells: Cell[]; row_total: number; row_net: number; row_count: number }
interface Category { id: string; name: string; sort_order: number }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

// Four validated ordinal steps of the blue ramp, plus "no fill" for zero.
// Empty means empty: a month with no spend in a category gets the surface, not
// the palest step, so nothing looks like something. Every visible step clears
// 2:1 against both app surfaces — checked with validate_palette.js --ordinal.
const BINS = [
  { min: 0.60, cls: 'bg-[#0d366b] dark:bg-[#6da7ec]', ink: 'text-white dark:text-gray-900' },
  { min: 0.30, cls: 'bg-[#1c5cab] dark:bg-[#3987e5]', ink: 'text-white' },
  { min: 0.10, cls: 'bg-[#3987e5] dark:bg-[#256abf]', ink: 'text-white' },
  { min: 0.00, cls: 'bg-[#86b6ef] dark:bg-[#184f95]', ink: 'text-gray-900 dark:text-white' },
]

// Ink is chosen by the fill's luminance — the one documented case where a label
// may sit on a colored fill (marks-and-anatomy.md).
function binFor(value: number, max: number) {
  if (value === 0 || max <= 0) return null
  const frac = Math.abs(value) / max
  return BINS.find(b => frac >= b.min) ?? BINS[BINS.length - 1]
}

const money = (n: number) =>
  n === 0 ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function CategoryMatrix({
  year, categories, matrix, yearTotals, useNet,
}: {
  year: number
  categories: Category[]
  matrix: Row[]
  yearTotals: { byCategory: { category_id: string; total: number }[]; total: number; net: number }
  useNet: boolean
}) {
  const val = (c: Cell) => (useNet ? c.net : c.total)

  // Scale is relative to the largest cell in the year on screen, so the shading
  // means something within what the reader is looking at.
  const max = Math.max(0, ...matrix.flatMap(r => r.cells.map(c => Math.abs(val(c)))))

  const colTotal = (id: string) =>
    matrix.reduce((a, r) => a + val(r.cells.find(c => c.category_id === id) ?? { total: 0, net: 0 } as Cell), 0)
  const grand = matrix.reduce((a, r) => a + (useNet ? r.row_net : r.row_total), 0)

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <caption className="sr-only">
            Spend for {year} by month and category, in US dollars
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-white dark:bg-gray-900 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 px-3 py-2">
                Month
              </th>
              {categories.map(c => (
                <th key={c.id} scope="col" className="px-2 py-2 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {c.name}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.map(row => {
              const rowVal = useNet ? row.row_net : row.row_total
              return (
                <tr key={row.month}>
                  <th scope="row" className="sticky left-0 z-10 bg-white dark:bg-gray-900 text-left font-normal text-gray-600 dark:text-gray-300 px-3 py-1.5 whitespace-nowrap">
                    {MONTHS[row.month - 1]}
                  </th>
                  {categories.map(c => {
                    const cell = row.cells.find(x => x.category_id === c.id)
                    const v = cell ? val(cell) : 0
                    const bin = binFor(v, max)
                    return (
                      <td
                        key={c.id}
                        // 2px surface gap between fills — white doing the separating,
                        // never a border drawn around the mark.
                        className="p-[1px]"
                        title={cell && cell.count
                          ? `${c.name} · ${MONTHS[row.month - 1]} ${year}\n${v.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} across ${cell.count} ${cell.count === 1 ? 'entry' : 'entries'}`
                          : undefined}
                      >
                        <div className={cn(
                          'rounded px-2 py-1.5 text-right tabular-nums',
                          bin ? `${bin.cls} ${bin.ink} font-medium` : 'text-gray-300 dark:text-gray-700',
                        )}>
                          {money(v)}
                        </div>
                      </td>
                    )
                  })}
                  <td className="px-3 py-1.5 text-right font-semibold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">
                    {money(rowVal)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 dark:border-gray-700">
              <th scope="row" className="sticky left-0 z-10 bg-white dark:bg-gray-900 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 px-3 pt-2.5">
                {year} total
              </th>
              {categories.map(c => (
                <td key={c.id} className="px-2 pt-2.5 text-right text-xs font-semibold text-gray-700 dark:text-gray-200 tabular-nums whitespace-nowrap">
                  {money(colTotal(c.id))}
                </td>
              ))}
              <td className="px-3 pt-2.5 text-right text-sm font-bold text-gray-900 dark:text-white tabular-nums whitespace-nowrap">
                {money(grand)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Scale legend — a sequential encoding always says what the shading means */}
      <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
        <span>Share of the year’s largest cell</span>
        <span className="flex items-center gap-[2px]">
          {[...BINS].reverse().map(b => (
            <span key={b.min} className={cn('w-6 h-3 rounded-sm', b.cls)} />
          ))}
        </span>
        <span className="tabular-nums">
          {max > 0 ? `up to ${money(max)}` : 'no spend recorded'}
        </span>
      </div>
    </div>
  )
}
