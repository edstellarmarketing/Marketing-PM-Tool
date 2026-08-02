import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModuleAccess } from '@/lib/api'

// Everything the dashboard needs in one call: the month × category matrix, the
// KPI figures, and a 12-month trend.
//
// Reads `expense_monthly_totals` (migration 072) rather than the raw ledger —
// the view is already grouped and excludes soft-deleted rows, so it is one small
// result set (a few hundred rows for four years) instead of 1,300 expense rows.
export const dynamic = 'force-dynamic'

interface ViewRow {
  year: number
  month: number
  category_id: string
  category_name: string
  category_sort_order: number
  net_usd: string | number
  tax_usd: string | number
  total_usd: string | number
  entry_count: number
}

const key = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`

export async function GET(req: NextRequest) {
  const { error } = await requireModuleAccess('expenses')
  if (error) return error

  const sp = new URL(req.url).searchParams
  const db = createAdminClient()

  const { data, error: dbError } = await db
    .from('expense_monthly_totals')
    .select('year, month, category_id, category_name, category_sort_order, net_usd, tax_usd, total_usd, entry_count')
    .order('year')
    .order('month')
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  const view = ((data ?? []) as ViewRow[]).map(r => ({
    ...r,
    net_usd: Number(r.net_usd),
    tax_usd: Number(r.tax_usd),
    total_usd: Number(r.total_usd),
  }))

  const years = [...new Set(view.map(r => r.year))].sort((a, b) => a - b)
  if (years.length === 0) {
    return NextResponse.json({ empty: true, years: [], categories: [], matrix: [], kpis: null, trend: [] })
  }

  // Which year the matrix shows. Defaults to the latest with data rather than the
  // calendar year, so an empty January does not open on a blank grid.
  const requested = Number(sp.get('year'))
  const year = years.includes(requested) ? requested : years[years.length - 1]

  // The anchor month everything is measured from: the most recent month WITH DATA
  // in the selected year. Two reasons it is not simply "today" — a dashboard
  // opened on the 1st should not lead with a $0 month, and the year control sits
  // in the filter row above every card, so it has to scope the KPIs and the trend
  // too, not just the matrix.
  const monthsInYear = view.filter(r => r.year === year).map(r => r.month)
  const anchorMonth = monthsInYear.length ? Math.max(...monthsInYear) : 12
  const anchor = { year, month: anchorMonth }
  // Whether the selected year is still accruing — decides "to date" vs "total".
  const isLatestYear = year === years[years.length - 1]

  const categories = [...new Map(view.map(r => [r.category_id, {
    id: r.category_id, name: r.category_name, sort_order: r.category_sort_order,
  }])).values()].sort((a, b) => a.sort_order - b.sort_order)

  // ── Matrix: 12 rows for the selected year × one column per category ─────────
  const cell = new Map<string, { total: number; net: number; tax: number; count: number }>()
  for (const r of view) {
    cell.set(`${key(r.year, r.month)}|${r.category_id}`, {
      total: r.total_usd, net: r.net_usd, tax: r.tax_usd, count: r.entry_count,
    })
  }

  const matrix = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const cells = categories.map(c => {
      const v = cell.get(`${key(year, month)}|${c.id}`)
      return { category_id: c.id, total: v?.total ?? 0, net: v?.net ?? 0, tax: v?.tax ?? 0, count: v?.count ?? 0 }
    })
    return {
      month,
      cells,
      row_total: cells.reduce((a, c) => a + c.total, 0),
      row_net: cells.reduce((a, c) => a + c.net, 0),
      row_count: cells.reduce((a, c) => a + c.count, 0),
    }
  })

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const sumMonth = (y: number, m: number) =>
    view.filter(r => r.year === y && r.month === m)
      .reduce((a, r) => ({ total: a.total + r.total_usd, net: a.net + r.net_usd }), { total: 0, net: 0 })

  // Year to date, bounded by the anchor month so this year and last are compared
  // over the same span — otherwise a part-year always looks like a fall.
  const sumYtd = (y: number, throughMonth: number) =>
    view.filter(r => r.year === y && r.month <= throughMonth)
      .reduce((a, r) => ({ total: a.total + r.total_usd, net: a.net + r.net_usd }), { total: 0, net: 0 })

  const prevMonth = anchor.month === 1
    ? { year: anchor.year - 1, month: 12 }
    : { year: anchor.year, month: anchor.month - 1 }

  const thisMonth = sumMonth(anchor.year, anchor.month)
  const lastMonth = sumMonth(prevMonth.year, prevMonth.month)
  const ytd = sumYtd(anchor.year, anchor.month)
  const ytdPrior = sumYtd(anchor.year - 1, anchor.month)

  const pct = (now: number, before: number) =>
    before === 0 ? null : Math.round(((now - before) / Math.abs(before)) * 1000) / 10

  // ── Trend: the 12 months ending at the anchor ──────────────────────────────
  const trend: { year: number; month: number; label: string; total: number; net: number }[] = []
  for (let i = 11; i >= 0; i--) {
    let y = anchor.year
    let m = anchor.month - i
    while (m <= 0) { m += 12; y -= 1 }
    const s = sumMonth(y, m)
    trend.push({ year: y, month: m, label: key(y, m), total: s.total, net: s.net })
  }

  // The same 12 months shifted back a year, for the comparison overlay. Shares
  // the trend's scale — never its own axis.
  const trendPrior = trend.map(t => {
    const s = sumMonth(t.year - 1, t.month)
    return { year: t.year - 1, month: t.month, label: key(t.year - 1, t.month), total: s.total, net: s.net }
  })

  // Per-category series over the same window, for the optional stacked view.
  const trendByCategory = categories.map(c => ({
    category_id: c.id,
    name: c.name,
    values: trend.map(t => {
      const v = cell.get(`${key(t.year, t.month)}|${c.id}`)
      return v?.total ?? 0
    }),
  }))

  const grand = view.reduce((a, r) => ({ total: a.total + r.total_usd, net: a.net + r.net_usd, tax: a.tax + r.tax_usd }),
    { total: 0, net: 0, tax: 0 })

  return NextResponse.json({
    empty: false,
    years,
    year,
    anchor,
    isLatestYear,
    categories,
    matrix,
    yearTotals: {
      // Column totals for the selected year, aligned to `categories`.
      byCategory: categories.map(c => ({
        category_id: c.id,
        total: matrix.reduce((a, row) => a + (row.cells.find(x => x.category_id === c.id)?.total ?? 0), 0),
      })),
      total: matrix.reduce((a, r) => a + r.row_total, 0),
      net: matrix.reduce((a, r) => a + r.row_net, 0),
    },
    kpis: {
      thisMonth, lastMonth,
      momPct: pct(thisMonth.total, lastMonth.total),
      ytd, ytdPrior,
      yoyPct: pct(ytd.total, ytdPrior.total),
      grand,
    },
    trend,
    trendPrior,
    // True only when the earlier window actually has data — otherwise the
    // comparison toggle would offer a flat line at zero.
    hasPrior: trendPrior.some(t => t.total !== 0),
    trendByCategory,
  })
}
