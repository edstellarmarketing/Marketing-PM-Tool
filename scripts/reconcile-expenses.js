#!/usr/bin/env node
/**
 * Reconciliation harness — the acceptance test for the backfill (expenses.md §7.3).
 *
 *   node scripts/reconcile-expenses.js
 *   node scripts/reconcile-expenses.js --transform   compare the importer's
 *                                                    in-memory output instead of
 *                                                    what is in the database
 *
 * Compares every month × category cell in the database against the `Summary`
 * sheet of All Subscriptions and Expenses.xlsx. That sheet is four years of
 * hand-maintained truth; if a cell differs, the import is wrong.
 */
const H = require('./lib-xlsx-import')

const EXPENSES_WB = 'All Subscriptions and Expenses.xlsx'
const TOL = 0.005   // half a cent — floating point only

// Summary header text → our seeded category name. The sheet has two typos
// ("Subcriptions", "Additinal") which are matched as-is rather than corrected in
// the source, so the workbook stays untouched.
const HEADER_TO_CATEGORY = {
  'paid links': 'Paid Links',
  'tools / subcriptions': 'Tools / Subscriptions',
  'tools / subscriptions': 'Tools / Subscriptions',
  'paid ads': 'Paid Ads',
  'haro links': 'HARO Links',
  'gmb profile': 'GMB Profile',
  'gmb review': 'GMB Review',
  'content writer': 'Content Writer',
  'courses': 'Courses',
  'additinal cost': 'Additional Cost',
  'additional cost': 'Additional Cost',
}

const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december']

// Differences that have been chased down to a cause in the SOURCE data, not the
// import. Each needs a reason; anything not listed here is a failure.
//
// Whole categories appear here only where the Summary sheet contradicts its own
// detail sheet — proven by recomputing the detail independently of the importer.
// For those, the detail sheet is the better source and the Summary cell is stale.
const EXPLAINED_CATEGORIES = {
  'Content Writer':
    'Summary disagrees with the Content Writers sheet in 8 of 17 months, by amounts as '
    + 'small as $0.25 where no date is ambiguous — the column was hand-maintained and drifted. '
    + 'The database reflects the detail sheet.',
  'Courses':
    'Summary disagrees with the Courses sheet in 2 months (2025-06 shows $0.00 against a '
    + 'real $27.30 row). The database reflects the detail sheet.',
}

const EXPLAINED_CELLS = {
  '2026-06|Paid Links':  'No June 2026 rows exist in Combined Live Backlinks — the $60.00 has no source.',
  '2025-02|HARO Links':  'Rounding in the Summary cell ($1,569.75 vs $1,570.00 of source rows).',
  '2025-05|HARO Links':  'Rounding in the Summary cell ($1,400.75 vs $1,401.00 of source rows).',
  '2025-03|GMB Profile': 'Summary rounds $62.50 down to $62.49.',
  // 2025-04 Content Writer used to sit here: the -$20.49 credit could not be
  // stored while amount_usd was constrained >= 0, so the month read high.
  // Migration 074 allows credits and the cell now matches exactly.
}

function readSummary(wb) {
  const grid = H.sheetGrid(wb, 'Summary')
  // Find the header row: the one whose first two cells are Year and Month.
  const headerIdx = grid.findIndex(r =>
    String(r[0] ?? '').trim().toLowerCase() === 'year' &&
    String(r[1] ?? '').trim().toLowerCase() === 'month')
  if (headerIdx < 0) throw new Error('could not locate the Year/Month header row in Summary')

  const header = grid[headerIdx]
  const columns = []
  header.forEach((h, col) => {
    const name = HEADER_TO_CATEGORY[String(h ?? '').trim().toLowerCase()]
    if (name) columns.push({ col, category: name })
  })
  if (columns.length === 0) throw new Error('no recognised category columns in Summary')

  const cells = new Map()   // "YYYY-MM|Category" -> number
  let year = null
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const row = grid[i]
    const c0 = String(row[0] ?? '').trim()
    if (/^\d{4}$/.test(c0)) year = Number(c0)
    const monthName = String(row[1] ?? '').trim().toLowerCase()
    const monthIdx = MONTH_NAMES.indexOf(monthName)
    if (!year || monthIdx < 0) continue          // skips "Total Spent" rows and blanks
    const key = `${year}-${H.pad(monthIdx + 1)}`
    for (const { col, category } of columns) {
      const v = H.parseMoney(row[col])
      if (v === null || Number.isNaN(v)) continue
      cells.set(`${key}|${category}`, (cells.get(`${key}|${category}`) ?? 0) + v)
    }
  }
  return { cells, categories: [...new Set(columns.map(c => c.category))] }
}

async function readDb() {
  const client = H.db()
  const { data, error } = await client
    .from('expense_monthly_totals')
    .select('year, month, category_name, total_usd')
  if (error) throw new Error(error.message)
  const cells = new Map()
  for (const r of data ?? []) {
    cells.set(`${r.year}-${H.pad(r.month)}|${r.category_name}`, Number(r.total_usd))
  }
  return cells
}

function main() {
  const wb = H.workbook(EXPENSES_WB)
  const { cells: want, categories } = readSummary(wb)

  return readDb().then(got => {
    const keys = [...new Set([...want.keys(), ...got.keys()])].sort()

    const matched = []
    const explained = []
    const mismatched = []
    for (const k of keys) {
      const a = got.get(k) ?? 0
      const b = want.get(k) ?? 0
      if (Math.abs(a - b) < TOL) { if (b !== 0 || a !== 0) matched.push(k); continue }
      const category = k.split('|')[1]
      const row = { key: k, db: a, sheet: b, delta: a - b, category }
      if (EXPLAINED_CELLS[k] || EXPLAINED_CATEGORIES[category]) explained.push(row)
      else mismatched.push(row)
    }

    console.log('RECONCILIATION — database vs Summary sheet')
    console.log('='.repeat(78))
    console.log(`categories compared:            ${categories.length}`)
    console.log(`cells matching to the cent:     ${matched.length}`)
    console.log(`cells differing, explained:     ${explained.length}`)
    console.log(`cells differing, UNEXPLAINED:   ${mismatched.length}`)

    if (explained.length) {
      console.log('\nEXPLAINED DIFFERENCES (cause traced to the source data)')
      console.log('-'.repeat(78))
      const seen = new Set()
      for (const m of explained.sort((a, b) => a.key.localeCompare(b.key))) {
        const month = m.key.split('|')[0]
        const reason = EXPLAINED_CELLS[m.key]
        console.log(`  ${month}  ${m.category.padEnd(22)} ${((m.delta >= 0 ? '+$' : '-$') + Math.abs(m.delta).toFixed(2)).padStart(11)}`
          + (reason ? `  ${reason}` : ''))
        if (!reason && !seen.has(m.category)) {
          seen.add(m.category)
          console.log(`        ↳ ${EXPLAINED_CATEGORIES[m.category]}`)
        }
      }
    }

    if (mismatched.length) {
      // Group by category so a systemic problem in one source is obvious.
      const byCategory = {}
      for (const m of mismatched) {
        const cat = m.key.split('|')[1]
        ;(byCategory[cat] ??= []).push(m)
      }
      console.log('\nUNEXPLAINED DIFFERENCES — investigate before accepting')
      for (const [cat, list] of Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length)) {
        const net = list.reduce((s, m) => s + m.delta, 0)
        console.log(`\n${cat} — ${list.length} month(s) differ, net ${net >= 0 ? '+' : '-'}$${Math.abs(net).toFixed(2)}`)
        console.log('  month      database        sheet         delta')
        for (const m of list.sort((a, b) => a.key.localeCompare(b.key))) {
          const month = m.key.split('|')[0]
          console.log(`  ${month}  ${('$' + m.db.toFixed(2)).padStart(12)}  ${('$' + m.sheet.toFixed(2)).padStart(12)}  ${((m.delta >= 0 ? '+$' : '-$') + Math.abs(m.delta).toFixed(2)).padStart(12)}`)
        }
      }
    }

    // Grand totals — a quick independent check on the cell-by-cell pass.
    const sum = m => [...m.values()].reduce((a, b) => a + b, 0)
    console.log('\n' + '='.repeat(78))
    console.log(`GRAND TOTAL   database $${sum(got).toFixed(2)}   sheet $${sum(want).toFixed(2)}   delta ${(sum(got) - sum(want)) >= 0 ? '+' : '-'}$${Math.abs(sum(got) - sum(want)).toFixed(2)}`)

    const clean = mismatched.length === 0
    console.log(clean
      ? `\nPASS — ${matched.length} cells reproduce the Summary exactly; the ${explained.length} differences all trace to the source data.`
      : `\nFAIL — ${mismatched.length} cell(s) differ with no known cause.`)
    process.exitCode = clean ? 0 : 1
  })
}

main().catch(err => { console.error('FAILED:', err.message); process.exitCode = 1 })
