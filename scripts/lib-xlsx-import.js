// Shared helpers for the expenses backfill (expenses.md §7).
// Plain CJS — package.json has no "type": "module".

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

// ── env ──────────────────────────────────────────────────────────────────────
function loadEnv() {
  const file = path.join(ROOT, '.env.local')
  if (!fs.existsSync(file)) throw new Error('.env.local not found — cannot reach Supabase')
  const env = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

function db() {
  const env = loadEnv()
  const { createClient } = require(path.join(ROOT, 'node_modules/@supabase/supabase-js'))
  const url = env.SERVICE_URL_SUPABASEKONG || env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SERVICE_SUPABASESERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase URL or service key in .env.local')
  return createClient(url, key, { db: { schema: 'Marketing-PM-Tool' } })
}

function workbook(name) {
  const XLSX = require(path.join(ROOT, 'node_modules/xlsx'))
  return XLSX.readFile(path.join(ROOT, name), { cellDates: true })
}

function sheetRows(wb, name) {
  const XLSX = require(path.join(ROOT, 'node_modules/xlsx'))
  const ws = wb.Sheets[name]
  if (!ws) throw new Error(`sheet not found: ${name}`)
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
}

function sheetGrid(wb, name) {
  const XLSX = require(path.join(ROOT, 'node_modules/xlsx'))
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' })
}

// ── dates ────────────────────────────────────────────────────────────────────
// An explicit format list with a hard failure on anything unmatched. A silent
// skip is what hid $1,915.20 of Paid Links during analysis (expenses.md §3.1),
// so unparseable dates are collected and reported, never dropped quietly.
const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
}

function pad(n) { return String(n).padStart(2, '0') }

function parseDate(value) {
  if (value instanceof Date && !isNaN(value)) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  const s = String(value ?? '').trim()
  if (!s) return null

  let m
  // 2026-08-01
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`

  // "Jan 2, 2026" | "June 20 2024" | "February 27,2024"  (comma optional, space optional)
  if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*,?\s*(\d{4})$/))) {
    const mo = MONTHS[m[1].toLowerCase()]
    if (mo) return `${m[3]}-${pad(mo)}-${pad(Number(m[2]))}`
  }

  // "22-Dec-2022" | "02-Mar-22"
  if ((m = s.match(/^(\d{1,2})[-/]([A-Za-z]{3,9})[-/](\d{2,4})$/))) {
    const mo = MONTHS[m[2].toLowerCase()]
    if (mo) {
      const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])
      return `${y}-${pad(mo)}-${pad(Number(m[1]))}`
    }
  }

  // "17 June 2025" | "10 July, 2025"  — day first
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s*,?\s*(\d{4})$/))) {
    const mo = MONTHS[m[2].toLowerCase()]
    if (mo) return `${m[3]}-${pad(mo)}-${pad(Number(m[1]))}`
  }

  // "March 2025" — no day; the 1st is the only defensible choice
  if ((m = s.match(/^([A-Za-z]{3,9})\s+(\d{4})$/))) {
    const mo = MONTHS[m[1].toLowerCase()]
    if (mo) return `${m[2]}-${pad(mo)}-01`
  }

  // "9/30/2025" — all-numeric slash dates. Which half is the month cannot be
  // assumed: this workbook contains both US M/D/YYYY (Content Writers) and
  // day-first D/M/YYYY (Imperium Upwork). Resolve only when one number exceeds
  // 12; otherwise report it rather than silently picking a reading and moving
  // a payment into the wrong month.
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    const a = Number(m[1]), b = Number(m[2]), y = Number(m[3])
    if (a > 12 && b <= 12) return `${y}-${pad(b)}-${pad(a)}`        // D/M
    if (b > 12 && a <= 12) return `${y}-${pad(a)}-${pad(b)}`        // M/D
    return { ambiguous: s }
  }

  // "23 Sep" | "Sept 02" | "5 Dec" — month and day but no year. Returned as a
  // partial so the caller can supply the year from surrounding rows; guessing
  // one here would hide the inference.
  if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?$/))) {
    const mo = MONTHS[m[2].toLowerCase()]
    if (mo) return { partial: { month: mo, day: Number(m[1]) }, raw: s }
  }
  if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})$/))) {
    const mo = MONTHS[m[1].toLowerCase()]
    if (mo) return { partial: { month: mo, day: Number(m[2]) }, raw: s }
  }

  return { unparseable: s }
}

// ── money ────────────────────────────────────────────────────────────────────
// Handles "$1,234.56", the 9 trailing-symbol cells ("15.49$", "42$"), "Free",
// "NA" and blanks. Returns null for "nothing recorded", NaN for "looks like a
// number but is not one" so the caller can distinguish.
function parseMoney(value) {
  const s = String(value ?? '').trim()
  if (!s) return null
  if (/^(free|na|n\/a|-|nil|tbd)$/i.test(s)) return null
  const cleaned = s.replace(/[$,\s]/g, '').replace(/\$$/, '')
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return NaN
  return Math.round(parseFloat(cleaned) * 100) / 100
}

function parseInt0(value) {
  const s = String(value ?? '').trim()
  if (!s) return null
  const n = parseInt(s.replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

function txt(value, max = 5000) {
  const s = String(value ?? '').trim()
  if (!s) return null
  return s.length > max ? s.slice(0, max) : s
}

function bool(value) {
  const s = String(value ?? '').trim().toLowerCase()
  if (s === 'yes' || s === 'true') return true
  if (s === 'no' || s === 'false') return false
  return undefined
}

// ── lookups ──────────────────────────────────────────────────────────────────
// Case-insensitive resolution, mirroring the UNIQUE index on lower(name) that
// exists precisely because the sheets contain HelpAB2BWriter / Helpab2bWriter.
async function loadLookups(client) {
  const tables = {
    categories: 'expense_categories',
    teams: 'expense_teams',
    verticals: 'expense_verticals',
    vendors: 'expense_vendors',
    backlinkTypes: 'expense_backlink_types',
  }
  const out = {}
  for (const [key, table] of Object.entries(tables)) {
    const { data, error } = await client.from(table).select('*')
    if (error) throw new Error(`${table}: ${error.message}`)
    out[key] = data
    out[`${key}ByName`] = new Map(data.map(r => [r.name.toLowerCase(), r.id]))
  }
  out.categoryBySlug = new Map(out.categories.map(c => [c.slug, c.id]))
  return out
}

// Spellings corrected in the migration 072 seed. Case-insensitive matching
// handles a case difference but NOT a typo, so without this the importer fails
// to find the corrected row and creates the misspelling as a second vendor —
// reintroducing the exact duplicate-name problem the lookup tables exist to
// prevent. (Caught in testing: "Zoho Campagins" appeared alongside the seeded
// "Zoho Campaigns".)
const VENDOR_ALIASES = new Map([
  ['zoho campagins', 'Zoho Campaigns'],
])

// Vendors that appear in the sheets but not the seed get created on demand.
async function vendorResolver(client, lookups) {
  const created = []
  return {
    async resolve(name) {
      let clean = txt(name, 120)
      if (!clean) return null
      const alias = VENDOR_ALIASES.get(clean.toLowerCase())
      if (alias) clean = alias
      const key = clean.toLowerCase()
      if (lookups.vendorsByName.has(key)) return lookups.vendorsByName.get(key)
      const { data, error } = await client
        .from('expense_vendors').insert({ name: clean }).select('id, name').single()
      if (error) {
        // Lost a race or hit the case-insensitive unique index — fetch the canonical row.
        const { data: existing } = await client
          .from('expense_vendors').select('id').ilike('name', clean).maybeSingle()
        if (existing) { lookups.vendorsByName.set(key, existing.id); return existing.id }
        throw new Error(`vendor "${clean}": ${error.message}`)
      }
      lookups.vendorsByName.set(key, data.id)
      created.push(data.name)
      return data.id
    },
    created,
  }
}

// Verticals: PMPrep361/362/363 are single-row typos of PMPrep360 (expenses.md §3.3).
function normaliseVertical(name) {
  const s = String(name ?? '').trim()
  if (/^pmprep36\d$/i.test(s)) return 'PMPrep360'
  return s
}

const BATCH = 200

async function insertRows(client, rows, onProgress) {
  let inserted = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    // defaultToNull:false is required: PostgREST sends an explicit NULL for any
    // key a row omits, which bypasses the column DEFAULT and trips
    // `meta jsonb NOT NULL DEFAULT '{}'`. Expense rows are heterogeneous by
    // category, so every batch would otherwise fail.
    const { error } = await client.from('expenses').insert(chunk, { defaultToNull: false })
    if (error) throw new Error(`insert failed at row ${i}: ${error.message}`)
    inserted += chunk.length
    if (onProgress) onProgress(inserted, rows.length)
  }
  return inserted
}

module.exports = {
  ROOT, loadEnv, db, workbook, sheetRows, sheetGrid,
  parseDate, parseMoney, parseInt0, txt, bool,
  loadLookups, vendorResolver, normaliseVertical, insertRows, MONTHS, pad,
}
