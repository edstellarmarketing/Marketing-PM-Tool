import { usd, type PublicOverview } from '@/lib/expense-report'
import { Card, heatBin } from './PublicChrome'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function PublicOverviewView({ data }: { data: PublicOverview }) {
  const { years, categories, perYear, categoryTotals, allTimeTotal } = data
  const spread = years.length > 1 ? `${years[years.length - 1]}–${years[0]}` : String(years[0])

  // One scale across every year so the year-by-year table is comparable
  // vertically; each monthly matrix is scaled within its own year, where the
  // question is which month stands out.
  const maxYearCell = Math.max(0, ...perYear.flatMap(y => y.categoryCells.map(Math.abs)))

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label={`All time (${spread})`} value={usd(allTimeTotal)} />
        <Card label="Years covered" value={String(years.length)} />
        <Card label="Entries" value={data.entryCount.toLocaleString('en-US')} />
        <Card label="Categories" value={String(categoryTotals.length)} />
      </div>

      {/* Year x category — the whole history on one screen, which is what the
          single-year view could not show. */}
      <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Every year by category</h2>
        <p className="text-xs text-gray-500 mb-3">
          Shading shows relative size across the whole table; every figure is readable as text.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                <th scope="col" className="text-left text-xs font-semibold text-gray-500 px-3 py-2">Year</th>
                {categories.map(c => (
                  <th key={c} scope="col" className="px-2 py-2 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">{c}</th>
                ))}
                <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-gray-900">Total</th>
              </tr>
            </thead>
            <tbody>
              {perYear.map(y => (
                <tr key={y.year}>
                  <th scope="row" className="text-left font-semibold text-gray-800 px-3 py-1.5 whitespace-nowrap">
                    {y.year}
                  </th>
                  {y.categoryCells.map((v, i) => {
                    const b = heatBin(v, maxYearCell)
                    return (
                      <td key={i} className="p-[1px]">
                        <div className="rounded px-2 py-1.5 text-right tabular-nums"
                          style={b ? { background: b.bg, color: b.fg, fontWeight: 500 } : { color: '#d1d5db' }}>
                          {v === 0 ? '—' : usd(v)}
                        </div>
                      </td>
                    )
                  })}
                  <td className="px-3 py-1.5 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                    {y.yearTotal === 0 ? '—' : usd(y.yearTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="text-left text-xs font-semibold text-gray-500 px-3 pt-2">All time</th>
                {categories.map(c => {
                  const t = categoryTotals.find(x => x.name === c)?.total ?? 0
                  return (
                    <td key={c} className="px-2 pt-2 text-right text-xs font-semibold text-gray-700 tabular-nums whitespace-nowrap">
                      {t === 0 ? '—' : usd(t)}
                    </td>
                  )
                })}
                <td className="px-3 pt-2 text-right text-xs font-bold text-gray-900 tabular-nums whitespace-nowrap">
                  {usd(allTimeTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Spend by category</h2>
        <p className="text-xs text-gray-500 mb-3">All years combined</p>
        <ul className="space-y-2">
          {categoryTotals.map(c => {
            const pct = allTimeTotal > 0 ? (c.total / allTimeTotal) * 100 : 0
            return (
              <li key={c.name}>
                <div className="flex items-baseline justify-between gap-3 mb-0.5">
                  <span className="text-xs text-gray-700">{c.name}</span>
                  <span className="text-xs font-semibold text-gray-900 tabular-nums">
                    {usd(c.total)} <span className="font-normal text-gray-400">{pct.toFixed(0)}%</span>
                  </span>
                </div>
                <div className="h-2 rounded-sm bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-r-[4px]" style={{ width: `${Math.max(pct, 0.8)}%`, background: '#2a78d6' }} />
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {/* Year-over-year by month, so a reader can see seasonality without
          switching pages. Newest year first. */}
      <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Monthly totals, year over year</h2>
        <p className="text-xs text-gray-500 mb-3">Each year scaled to its own busiest month.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                <th scope="col" className="text-left text-xs font-semibold text-gray-500 px-3 py-2">Year</th>
                {MON.map(m => (
                  <th key={m} scope="col" className="px-2 py-2 text-right text-xs font-semibold text-gray-500">{m}</th>
                ))}
                <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-gray-900">Total</th>
              </tr>
            </thead>
            <tbody>
              {perYear.map(y => {
                const max = Math.max(0, ...y.matrix.map(m => Math.abs(m.total)))
                return (
                  <tr key={y.year}>
                    <th scope="row" className="text-left font-semibold text-gray-800 px-3 py-1.5">{y.year}</th>
                    {y.matrix.map(m => {
                      const b = heatBin(m.total, max)
                      return (
                        <td key={m.month} className="p-[1px]">
                          <div className="rounded px-2 py-1.5 text-right tabular-nums text-xs"
                            style={b ? { background: b.bg, color: b.fg, fontWeight: 500 } : { color: '#d1d5db' }}>
                            {m.total === 0 ? '—' : usd(m.total)}
                          </div>
                        </td>
                      )
                    })}
                    <td className="px-3 py-1.5 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                      {usd(y.yearTotal)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Full month x category detail for every year. */}
      {perYear.map(y => {
        const max = Math.max(0, ...y.matrix.flatMap(r => r.cells.map(Math.abs)))
        return (
          <section key={y.year} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">{y.year} by month and category</h2>
            <p className="text-xs text-gray-500 mb-3">
              {usd(y.yearTotal)} across {y.monthsWithData} {y.monthsWithData === 1 ? 'month' : 'months'} with spend
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th scope="col" className="text-left text-xs font-semibold text-gray-500 px-3 py-2">Month</th>
                    {categories.map(c => (
                      <th key={c} scope="col" className="px-2 py-2 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">{c}</th>
                    ))}
                    <th scope="col" className="px-3 py-2 text-right text-xs font-semibold text-gray-900">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {y.matrix.map(row => (
                    <tr key={row.month}>
                      <th scope="row" className="text-left font-normal text-gray-600 px-3 py-1.5 whitespace-nowrap">
                        {MONTHS[row.month - 1]}
                      </th>
                      {row.cells.map((v, i) => {
                        const b = heatBin(v, max)
                        return (
                          <td key={i} className="p-[1px]">
                            <div className="rounded px-2 py-1.5 text-right tabular-nums"
                              style={b ? { background: b.bg, color: b.fg, fontWeight: 500 } : { color: '#d1d5db' }}>
                              {v === 0 ? '—' : usd(v)}
                            </div>
                          </td>
                        )
                      })}
                      <td className="px-3 py-1.5 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                        {row.total === 0 ? '—' : usd(row.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </>
  )
}
