#!/usr/bin/env node
/**
 * Expenses backfill — all four years, both workbooks. See expenses.md §7.
 *
 *   node scripts/import-expenses.js --dry-run    transform + report, write nothing
 *   node scripts/import-expenses.js              insert
 *   node scripts/import-expenses.js --wipe       remove a previous run, then stop
 *
 * Every inserted row carries meta.import_batch, so a bad run is fully
 * reversible with --wipe and can simply be re-run. Nothing here touches rows
 * entered by hand.
 *
 * Deliberately NOT imported (expenses.md §3.4, §7.2, §7.5):
 *   - any credential column (810 backlink rows carry passwords)
 *   - Imperium Upwork, Sheet15, Ads, SAAS Launch, Rough
 *   - the 1,759 free backlink rows — no expense to report
 *   - the HARO Links sheet's link rows — they duplicate the backlinks ledger
 */
const H = require('./lib-xlsx-import')

const BATCH_TAG = 'xlsx-v1'
const DRY = process.argv.includes('--dry-run')
const WIPE = process.argv.includes('--wipe')

const EXPENSES_WB = 'All Subscriptions and Expenses.xlsx'
const BACKLINKS_WB = 'Combined Live Backlinks.xlsx'

const dateFailures = []
const moneyFailures = []
const negativeRows = []
const notes = []

// A negative charge is a credit — Content Writers row 154 is -$20.49. Stored as
// a negative row so it nets off the month (migration 074 allows this; before
// that migration it had to be clamped to $0). Reported either way so it is never
// a silent transformation.
function recordNegative(sheet, rowIndex, amount, label) {
  if (amount === null || amount >= 0) return amount
  negativeRows.push({ sheet, row: rowIndex + 2, field: label, value: amount })
  return amount
}

function tag(sheet, rowIndex, extra = {}) {
  // +2 = 1 for the header row, 1 for Excel's 1-based numbering, so this points
  // at the row you would actually scroll to in the spreadsheet.
  return { import_batch: BATCH_TAG, source_sheet: sheet, source_row: rowIndex + 2, ...extra }
}

// The last fully-specified year seen per sheet. These sheets are maintained in
// roughly chronological order, which is what makes a no-year date like "5 Dec"
// recoverable — but the inference is recorded on the row so it can be audited,
// and reconciliation against the Summary is what confirms it landed right.
const lastYearBySheet = new Map()
const inferredYearRows = []

function takeDate(sheet, rowIndex, raw, label = 'date') {
  const d = H.parseDate(raw)

  if (typeof d === 'string') {
    lastYearBySheet.set(sheet, Number(d.slice(0, 4)))
    return d
  }

  if (d && d.partial) {
    const year = lastYearBySheet.get(sheet)
    if (!year) {
      dateFailures.push({ sheet, row: rowIndex + 2, field: label, value: `${d.raw} (no year, and none seen earlier in the sheet)` })
      return null
    }
    const iso = `${year}-${H.pad(d.partial.month)}-${H.pad(d.partial.day)}`
    inferredYearRows.push({ sheet, row: rowIndex + 2, raw: d.raw, resolved: iso })
    return iso
  }

  if (d && d.ambiguous) {
    dateFailures.push({ sheet, row: rowIndex + 2, field: label, value: `${d.ambiguous} (ambiguous day/month)` })
    return null
  }
  if (d && d.unparseable) {
    dateFailures.push({ sheet, row: rowIndex + 2, field: label, value: d.unparseable })
    return null
  }
  dateFailures.push({ sheet, row: rowIndex + 2, field: label, value: '(blank)' })
  return null
}

function takeMoney(sheet, rowIndex, raw, label = 'amount') {
  const v = H.parseMoney(raw)
  if (Number.isNaN(v)) {
    moneyFailures.push({ sheet, row: rowIndex + 2, field: label, value: String(raw) })
    return null
  }
  return v
}

const LINK_REL = {
  'dofollow': 'dofollow',
  'nofollow': 'nofollow',
  // Both mean an unlinked brand mention — collapsed per your call.
  'no link': 'text_mention',
  'no hyperlink': 'text_mention',
}

async function main() {
  const client = H.db()

  if (WIPE) {
    const { count: before } = await client.from('expenses')
      .select('*', { count: 'exact', head: true }).eq('meta->>import_batch', BATCH_TAG)
    const { error } = await client.from('expenses').delete().eq('meta->>import_batch', BATCH_TAG)
    if (error) throw new Error(error.message)
    // `like`, not `eq`: rows that carried a source comment were tagged
    // "import:xlsx-v1\n<comment>", so an equality match left every one of them
    // behind and each re-run stacked a fresh set of duplicates on top (caught
    // when the registry read 105 subscriptions instead of 61).
    const { count: subsBefore } = await client.from('expense_subscriptions')
      .select('*', { count: 'exact', head: true }).like('notes', `import:${BATCH_TAG}%`)
    const { error: se } = await client.from('expense_subscriptions').delete().like('notes', `import:${BATCH_TAG}%`)
    if (se) throw new Error(se.message)
    console.log(`wiped ${before ?? 0} imported expense rows and ${subsBefore ?? 0} imported subscriptions`)
    return
  }

  const lookups = await H.loadLookups(client)
  const vendors = await H.vendorResolver(client, lookups)

  const cat = slug => {
    const id = lookups.categoryBySlug.get(slug)
    if (!id) throw new Error(`category slug not seeded: ${slug}`)
    return id
  }
  const team = n => lookups.teamsByName.get(String(n ?? '').trim().toLowerCase()) ?? null
  const vertical = n => lookups.verticalsByName.get(H.normaliseVertical(n).toLowerCase()) ?? null
  const backlinkType = n => lookups.backlinkTypesByName.get(String(n ?? '').trim().toLowerCase()) ?? null

  const exWb = H.workbook(EXPENSES_WB)
  const blWb = H.workbook(BACKLINKS_WB)
  const rows = []
  const perSource = {}
  const add = (source, row) => {
    rows.push(row)
    perSource[source] = (perSource[source] ?? 0) + 1
  }

  // ── 1. Combined Live Backlinks → Paid Links + HARO Links ───────────────────
  // One sheet feeds two Summary categories, split on Backlink Type (§2.2).
  {
    const SHEET = 'Combined Live Backlinks'
    const src = H.sheetRows(blWb, SHEET)
    let pricelessPaid = 0
    let freeSettled = 0
    src.forEach((r, i) => {
      if (!/^paid$/i.test(String(r['Paid / Free'] ?? '').trim())) return

      const type = String(r['Backlink Type'] ?? '').trim()
      const isHaro = /haro/i.test(type)
      const date = takeDate(SHEET, i, r['Date'])
      if (!date) return

      const final = takeMoney(SHEET, i, r['Final Price'], 'Final Price')
      const initial = takeMoney(SHEET, i, r['Initial Price'], 'Initial Price')
      const paymentType = String(r['Payment Type'] ?? '').trim().toLowerCase()
      const srcStatus = String(r['Payment Status'] ?? '').trim().toLowerCase()

      let amount = final ?? initial
      let status = 'paid'
      if (amount === null) {
        // Flagged Paid with no price anywhere. The Summary excluded these too, so
        // importing at 0 keeps totals reconciling while preserving the record
        // that the placement happened (expenses.md §3.2).
        amount = 0
        status = 'pending'
        pricelessPaid++
      } else if (amount === 0 && (srcStatus === 'free' || paymentType === 'link exchange')) {
        // Asked for money, settled for a link swap or gave it free. Marking these
        // `free` rather than `paid` keeps them filterable and stops the dashboard
        // counting barter as a negotiated discount.
        status = 'free'
        freeSettled++
      } else if (srcStatus === 'pending') {
        status = 'pending'
      }

      add(SHEET, {
        expense_date: date,
        amount_usd: amount,
        initial_price_usd: initial !== null && initial !== amount ? initial : null,
        category_id: cat(isHaro ? 'haro-links' : 'paid-links'),
        backlink_type_id: backlinkType(type),
        vertical_id: vertical(r['Vertical']),
        link_site: H.txt(r['Backlink Website'], 2000),
        link_url: H.txt(r['Live Link'], 2000),
        link_rel: LINK_REL[String(r['Dofollow / Nofollow'] ?? '').trim().toLowerCase()] ?? null,
        payee: H.txt(r['Freelancer Name'], 200),
        // The sheet's "Team" column holds people, not teams (§2.4).
        acquired_by: H.txt(r['Team'], 200),
        country: H.txt(r['Country'], 100),
        payment_status: status,
        payment_method: paymentType === 'link exchange' ? 'link_exchange'
          : paymentType.includes('payment') ? 'manual' : null,
        description: H.txt(r['Key Highlights'], 1000),
        notes: H.txt(r['Comments'], 5000),
        meta: tag(SHEET, i, {
          da: H.parseInt0(r['DA']) ?? undefined,
          pa: H.parseInt0(r['PA']) ?? undefined,
          ss: H.parseInt0(r['SS']) ?? undefined,
          traffic: H.txt(r['Traffic'], 40) ?? undefined,
          da_range: H.txt(r['Website DA Range'], 40) ?? undefined,
          target_page: H.txt(r['Target Page'], 2000) ?? undefined,
          target_keyword: H.txt(r['Target Keyword'], 400) ?? undefined,
          semrush_detected: H.bool(r['Semrush Detected']),
          search_console_detected: H.bool(r['Search Console Detected']),
        }),
      })
    })
    if (pricelessPaid) notes.push(`${pricelessPaid} backlink rows flagged Paid carried no price — imported at $0 as "pending"`)
    if (freeSettled) notes.push(`${freeSettled} rows had an asking price but settled at $0 (link exchange / free) — imported as "free", not "paid"`)
  }

  // ── 2. Day-wise Spent → Tools / Subscriptions ──────────────────────────────
  {
    const SHEET = 'Day-wise Spent'
    const src = H.sheetRows(exWb, SHEET)
    for (const [i, r] of src.entries()) {
      const name = H.txt(r['Tool / Platform'], 200)
      if (!name) continue
      const date = takeDate(SHEET, i, r['Date'])
      const amount = takeMoney(SHEET, i, r['Amount ($)'])
      if (!date || amount === null) continue
      add(SHEET, {
        expense_date: date,
        amount_usd: amount,
        category_id: cat('tools-subscriptions'),
        vendor_id: await vendors.resolve(name),
        team_id: team(r['Team']),
        payment_status: 'paid',
        description: name,
        meta: tag(SHEET, i, { charge_type: H.txt(r['Type'], 40) ?? undefined }),
      })
    }
  }

  // ── 3. Ad Spends → Paid Ads ────────────────────────────────────────────────
  // Rows are campaign × month, not individual charges, and the sheet holds no
  // invoice date. Period end is the only defensible expense_date; the original
  // window is kept in meta (§7.4).
  {
    const SHEET = 'Ad Spends'
    const src = H.sheetRows(exWb, SHEET)
    for (const [i, r] of src.entries()) {
      const campaign = H.txt(r['Campaign'], 500)
      if (!campaign) continue
      const end = H.parseDate(r['End Date'])
      const start = H.parseDate(r['Start Date'])
      const usable = (d) => typeof d === 'string' ? d : null
      const date = usable(end) ?? usable(start)
      if (!date) { dateFailures.push({ sheet: SHEET, row: i + 2, field: 'End/Start Date', value: `${r['Start Date']} / ${r['End Date']}` }); continue }
      const amount = takeMoney(SHEET, i, r['Spend'])
      if (amount === null) continue
      add(SHEET, {
        expense_date: date,
        amount_usd: amount,
        category_id: cat('paid-ads'),
        vendor_id: await vendors.resolve(r['Tool']),
        payment_status: 'paid',
        description: campaign,
        meta: tag(SHEET, i, {
          campaign,
          campaign_status: H.txt(r['Campaign Status'], 40) ?? undefined,
          ad_strategy: H.txt(r['Ad Strategy'], 40) ?? undefined,
          period_start: usable(start) ?? undefined,
          period_end: usable(end) ?? undefined,
        }),
      })
    }
  }

  // ── 4. HARO Links → platform fees ONLY → Additional Cost ───────────────────
  // Its link rows duplicate the backlinks ledger; importing both double-counts
  // $11,771.50 (§2.2). Rows with no Link are the plan/pitch-pack purchases,
  // which is what "Additional Cost" has always been.
  {
    const SHEET = 'HARO Links'
    const src = H.sheetRows(exWb, SHEET)
    let fees = 0
    for (const [i, r] of src.entries()) {
      if (!String(r['Date'] ?? '').trim()) continue
      if (H.txt(r['Link'], 2000)) continue          // a placement → skip, already imported
      const amount = takeMoney(SHEET, i, r['Amount ($)'])
      if (amount === null) continue
      const date = takeDate(SHEET, i, r['Date'])
      if (!date) continue
      fees++
      add(SHEET, {
        expense_date: date,
        amount_usd: amount,
        category_id: cat('additional-cost'),
        vendor_id: await vendors.resolve(r['Platform']),
        vertical_id: vertical(r['Vertical']),
        payment_status: 'paid',
        description: H.txt(r['Purpose'], 1000),
        meta: tag(SHEET, i, { platform_fee: true }),
      })
    }
    notes.push(`HARO Links: imported ${fees} platform-fee rows, skipped its link rows as duplicates of the backlinks ledger`)
  }

  // ── 5. Content Writers → Content Writer ────────────────────────────────────
  {
    const SHEET = 'Content Writers'
    const src = H.sheetRows(exWb, SHEET)
    for (const [i, r] of src.entries()) {
      const raw = takeMoney(SHEET, i, r['Card Charges'], 'Card Charges')
      if (raw === null) continue                     // only 172 of 424 rows carry a charge
      const amount = recordNegative(SHEET, i, raw, 'Card Charges')
      const date = takeDate(SHEET, i, r['Date'])
      if (!date) continue
      add(SHEET, {
        expense_date: date,
        amount_usd: amount,
        category_id: cat('content-writer'),
        vendor_id: await vendors.resolve(r['Platform']),
        vertical_id: vertical(r['Vertical']),
        payee: H.txt(r['Freelancer Name'], 200),
        payment_status: 'paid',
        description: H.txt(r['Article'], 1000),
        notes: H.txt(r['Comments'], 5000),
        meta: tag(SHEET, i, {
          article_title: H.txt(r['Article'], 500) ?? undefined,
          article_cluster: H.txt(r['Article Cluster'], 200) ?? undefined,
          contract_status: H.txt(r['Contract Status'], 40) ?? undefined,
          article_status: H.txt(r['Article Status'], 40) ?? undefined,
          doc_url: H.txt(r['Article Doc'], 2000) ?? undefined,
          live_url: H.txt(r['Live Links'], 2000) ?? undefined,
        }),
      })
    }
  }

  // ── 6. Courses → Courses ───────────────────────────────────────────────────
  {
    const SHEET = 'Courses'
    const src = H.sheetRows(exWb, SHEET)
    for (const [i, r] of src.entries()) {
      const amount = takeMoney(SHEET, i, r['Total Spend ($)'], 'Total Spend ($)')
      if (amount === null) continue                  // only 13 of 170 rows carry a spend
      const date = takeDate(SHEET, i, r['Assigned Date'])
      if (!date) continue
      add(SHEET, {
        expense_date: date,
        amount_usd: amount,
        category_id: cat('courses'),
        payee: H.txt(r['Freelancer'], 200),
        payment_status: 'paid',
        description: H.txt(r['Courses'], 1000),
        notes: H.txt(r['Comments'], 5000),
        meta: tag(SHEET, i, {
          course_name: H.txt(r['Courses'], 500) ?? undefined,
          set: H.txt(r['SET'], 40) ?? undefined,
          publish_status: H.txt(r['Publish Status'], 40) ?? undefined,
        }),
      })
    }
  }

  // ── 7. GMB Profile / GMB Review ────────────────────────────────────────────
  {
    const SHEET = 'GMB Profile'
    for (const [i, r] of H.sheetRows(exWb, SHEET).entries()) {
      if (!String(r['Date'] ?? '').trim()) continue
      const date = takeDate(SHEET, i, r['Date'])
      const amount = takeMoney(SHEET, i, r['Amount ($)'])
      if (!date || amount === null) continue
      add(SHEET, {
        expense_date: date, amount_usd: amount, category_id: cat('gmb-profile'),
        vertical_id: vertical(r['Vertical']), payee: H.txt(r['Freelancer'], 200),
        country: H.txt(r['Country'], 100), payment_status: 'paid',
        description: H.txt(r['Purpose'], 1000), meta: tag(SHEET, i),
      })
    }
  }
  {
    const SHEET = 'GMB Review'
    for (const [i, r] of H.sheetRows(exWb, SHEET).entries()) {
      if (!String(r['Date'] ?? '').trim()) continue
      const date = takeDate(SHEET, i, r['Date'])
      const amount = takeMoney(SHEET, i, r['Amount ($)'])
      if (!date || amount === null) continue
      add(SHEET, {
        expense_date: date, amount_usd: amount, category_id: cat('gmb-review'),
        vertical_id: vertical(r['Vertical']), country: H.txt(r['Country'], 100),
        acquired_by: H.txt(r['Team'], 200), payment_status: 'paid',
        description: `GMB reviews${r['Reviews Count'] ? ` (${r['Reviews Count']})` : ''}`,
        meta: tag(SHEET, i, { reviews_count: H.parseInt0(r['Reviews Count']) ?? undefined }),
      })
    }
  }

  // ── 8. Wikipedia → Additional Cost, refunded ───────────────────────────────
  // The Summary never counted this: 2025 Additional Cost is $0.00 and the row is
  // marked Refunded. Imported at $0 with the original amount in the note, so the
  // attempt is on record without inventing spend that reconciliation would flag.
  {
    const SHEET = 'Wikipedia'
    for (const [i, r] of H.sheetRows(exWb, SHEET).entries()) {
      const name = H.txt(r['Name'], 200)
      if (!name) continue
      const original = takeMoney(SHEET, i, r['Price ($)'], 'Price ($)')
      const refunded = /refund/i.test(String(r['Comments'] ?? '')) || /drop/i.test(String(r['Status'] ?? ''))
      add(SHEET, {
        // No date column at all in this sheet; the Summary attributes nothing to
        // it, so a nominal date is used and flagged in meta.
        expense_date: '2025-11-01',
        amount_usd: refunded ? 0 : (original ?? 0),
        category_id: cat('additional-cost'),
        payee: name, country: H.txt(r['Country'], 100),
        payment_status: refunded ? 'refunded' : 'paid',
        description: H.txt(r['Task Details'], 1000) ?? 'Wikipedia page creation',
        notes: `${refunded ? `Refunded — original charge $${original ?? 0}. ` : ''}${H.txt(r['Comments'], 400) ?? ''}`.trim(),
        meta: tag(SHEET, i, { date_estimated: true, original_amount_usd: original ?? undefined }),
      })
    }
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  const total = rows.reduce((a, r) => a + r.amount_usd, 0)
  console.log('\nTRANSFORM SUMMARY')
  console.log('='.repeat(64))
  for (const [source, n] of Object.entries(perSource).sort((a, b) => b[1] - a[1])) {
    const sum = rows.filter(r => r.meta.source_sheet === source).reduce((a, r) => a + r.amount_usd, 0)
    console.log(`  ${source.padEnd(26)} ${String(n).padStart(5)} rows   $${sum.toFixed(2).padStart(12)}`)
  }
  console.log('  ' + '-'.repeat(60))
  console.log(`  ${'TOTAL'.padEnd(26)} ${String(rows.length).padStart(5)} rows   $${total.toFixed(2).padStart(12)}`)

  if (vendors.created.length) {
    console.log(`\n  vendors created on demand (${vendors.created.length}): ${vendors.created.join(', ')}`)
  }
  for (const n of notes) console.log(`\n  note: ${n}`)

  if (inferredYearRows.length) {
    console.log(`\nYEAR INFERRED from earlier rows in the same sheet (${inferredYearRows.length})`)
    console.log('='.repeat(64))
    for (const r of inferredYearRows) {
      console.log(`  ${r.sheet} row ${r.row} · ${JSON.stringify(r.raw)} -> ${r.resolved}`)
    }
  }

  if (negativeRows.length) {
    console.log(`\nCREDITS — negative amounts, stored as negative rows so they net off (${negativeRows.length})`)
    console.log('='.repeat(64))
    for (const r of negativeRows) {
      console.log(`  ${r.sheet} row ${r.row} · ${r.field} = $${r.value.toFixed(2)}`)
    }
  }

  if (dateFailures.length || moneyFailures.length) {
    console.log('\nPARSE FAILURES — these rows were NOT imported')
    console.log('='.repeat(64))
    for (const f of [...dateFailures, ...moneyFailures].slice(0, 40)) {
      console.log(`  ${f.sheet} row ${f.row} · ${f.field} = ${JSON.stringify(f.value)}`)
    }
    const extra = dateFailures.length + moneyFailures.length - 40
    if (extra > 0) console.log(`  …and ${extra} more`)
  } else {
    console.log('\n  no parse failures')
  }

  if (DRY) {
    console.log('\n--dry-run: nothing written.')
    return
  }

  // ── Insert ─────────────────────────────────────────────────────────────────
  const { count: existing } = await client.from('expenses')
    .select('*', { count: 'exact', head: true }).eq('meta->>import_batch', BATCH_TAG)
  if (existing) {
    console.log(`\nABORT: ${existing} rows from batch "${BATCH_TAG}" already exist. Run --wipe first.`)
    process.exitCode = 1
    return
  }

  console.log('\ninserting…')
  const n = await H.insertRows(client, rows, (done, all) => {
    if (done % 400 === 0 || done === all) console.log(`  ${done}/${all}`)
  })
  console.log(`inserted ${n} expense rows`)

  // ── Subscriptions registry ─────────────────────────────────────────────────
  const subs = await buildSubscriptions(exWb, lookups, vendors)
  if (subs.length) {
    const { error } = await client.from('expense_subscriptions').insert(subs, { defaultToNull: false })
    if (error) throw new Error(`subscriptions: ${error.message}`)
    console.log(`inserted ${subs.length} subscriptions`)
  }

  console.log('\nDone. Next: node scripts/reconcile-expenses.js')
}

// Tools & Subscriptions → the commitments registry. `Subscription Type` is a
// merged group header populated only on the first row of each block, so it is
// carried down.
async function buildSubscriptions(wb, lookups, vendors) {
  const SHEET = 'Tools & Subscriptions'
  const src = H.sheetRows(wb, SHEET)
  const CYCLE = { 'monthly': 'monthly', 'yearly': 'yearly', 'credits based': 'credits', 'one time': 'one_time' }
  const out = []
  let cycle = null

  for (const r of src) {
    const header = H.txt(r['Subscription Type'], 40)
    if (header) cycle = CYCLE[header.toLowerCase()] ?? 'custom'
    const name = H.txt(r['Name of the Tool'], 200)
    if (!name) continue

    const payRaw = String(r['Payment Type'] ?? '').trim().toLowerCase()
    const activeRaw = String(r['Status'] ?? '').trim().toLowerCase()
    // "Cancelled" appears in the Payment Type column but is a status, not a
    // method — split apart here (expenses.md §3.3).
    const cancelled = payRaw === 'cancelled' || activeRaw === 'not active'

    const started = H.parseDate(r['Purchased Date'])
    const ends = H.parseDate(r['Ending Date'])
    const asDate = d => (typeof d === 'string' ? d : null)

    out.push({
      name,
      vendor_id: await vendors.resolve(name),
      billing_cycle: cycle ?? 'custom',
      amount_usd: H.parseMoney(r['Price']) ?? null,
      started_on: asDate(started),
      ends_on: asDate(ends),
      payment_method: payRaw === 'auto pay' ? 'auto_pay' : payRaw === 'manual' ? 'manual' : null,
      status: cancelled ? 'cancelled' : 'active',
      owner_name: H.txt(r['Responsible Person'], 200),
      team_id: lookups.teamsByName.get(String(r['Team Using'] ?? '').trim().toLowerCase()) ?? null,
      seats: null,
      invoice_url: H.txt(r['Invoice'], 2000),
      // Tagged so --wipe can find these; user notes are appended.
      notes: `import:${BATCH_TAG}`,
      ...(H.txt(r['Comments'], 4000) ? {} : {}),
    })
  }
  // Keep the sheet's comments without losing the wipe tag.
  src.forEach((r) => {
    const name = H.txt(r['Name of the Tool'], 200)
    const comment = H.txt(r['Comments'], 4000)
    if (!name || !comment) return
    const row = out.find(o => o.name === name)
    if (row) row.notes = `import:${BATCH_TAG}\n${comment}`
  })
  return out
}

main().catch(err => {
  console.error('\nFAILED:', err.message)
  process.exitCode = 1
})
