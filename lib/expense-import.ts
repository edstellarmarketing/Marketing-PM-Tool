import { LINK_RELS, PAYMENT_METHODS, PAYMENT_STATUSES } from '@/lib/expenses'

// Bulk edit of existing ledger rows from a spreadsheet, matched on `ref`.
//
// The rule that makes this safe to run on 1,295 rows: **only columns present in
// the uploaded file are considered.** A column you did not include is left
// alone; a column you included but left blank is *cleared*. That distinction is
// the whole contract — without it, exporting three columns and re-importing
// would wipe every other field on every row.
//
// `Ref` is the key and is never written. Generated columns (Total, Domain) and
// audit columns (Entered by) are ignored rather than rejected, so the untouched
// export sheet round-trips without the user having to delete columns first.

export const IMPORT_KEY_HEADER = 'Ref'

type FieldKind = 'text' | 'money' | 'signedMoney' | 'date' | 'enum' | 'lookup'

export interface FieldSpec {
  /** Column in the expenses table. */
  column: string
  kind: FieldKind
  /** false = a blank cell is an error rather than a clear. */
  nullable: boolean
  maxLength?: number
  values?: readonly string[]
  /** Lookup table for name → id resolution. */
  table?: string
  label: string
}

// Keyed by the exact header the export writes, so an untouched export sheet is a
// valid import. Lowercased on lookup, so case and stray spaces do not matter.
export const IMPORT_FIELDS: Record<string, FieldSpec> = {
  'date':               { column: 'expense_date',      kind: 'date',        nullable: false, label: 'Date' },
  'category':           { column: 'category_id',       kind: 'lookup',      nullable: false, table: 'expense_categories',    label: 'Category' },
  'description':        { column: 'description',       kind: 'text',        nullable: true,  maxLength: 1000, label: 'Description' },
  'vendor':             { column: 'vendor_id',         kind: 'lookup',      nullable: true,  table: 'expense_vendors',       label: 'Vendor' },
  'team':               { column: 'team_id',           kind: 'lookup',      nullable: true,  table: 'expense_teams',         label: 'Team' },
  'vertical':           { column: 'vertical_id',       kind: 'lookup',      nullable: true,  table: 'expense_verticals',     label: 'Vertical' },
  'amount (usd)':       { column: 'amount_usd',        kind: 'signedMoney', nullable: false, label: 'Amount (USD)' },
  'tax (usd)':          { column: 'tax_usd',           kind: 'money',       nullable: true,  label: 'Tax (USD)' },
  'asking price (usd)': { column: 'initial_price_usd', kind: 'money',       nullable: true,  label: 'Asking price (USD)' },
  'status':             { column: 'payment_status',    kind: 'enum',        nullable: false, values: PAYMENT_STATUSES, label: 'Status' },
  'payment method':     { column: 'payment_method',    kind: 'enum',        nullable: true,  values: PAYMENT_METHODS,  label: 'Payment method' },
  'paid to':            { column: 'payee',             kind: 'text',        nullable: true,  maxLength: 200,  label: 'Paid to' },
  'acquired by':        { column: 'acquired_by',       kind: 'text',        nullable: true,  maxLength: 200,  label: 'Acquired by' },
  'country':            { column: 'country',           kind: 'text',        nullable: true,  maxLength: 100,  label: 'Country' },
  'link type':          { column: 'backlink_type_id',  kind: 'lookup',      nullable: true,  table: 'expense_backlink_types', label: 'Link type' },
  'link result':        { column: 'link_rel',          kind: 'enum',        nullable: true,  values: LINK_RELS, label: 'Link result' },
  'publisher site':     { column: 'link_site',         kind: 'text',        nullable: true,  maxLength: 2000, label: 'Publisher site' },
  'live link':          { column: 'link_url',          kind: 'text',        nullable: true,  maxLength: 2000, label: 'Live link' },
  'invoice url':        { column: 'invoice_url',       kind: 'text',        nullable: true,  maxLength: 2000, label: 'Invoice URL' },
  'notes':              { column: 'notes',             kind: 'text',        nullable: true,  maxLength: 4000, label: 'Notes' },
}

// Present in the export but not writable. Listed explicitly so they are skipped
// silently, while a genuinely unknown header still gets reported.
export const IGNORED_HEADERS = new Set([
  'ref', 'total (usd)', 'domain', 'subscription', 'entered by', 'ref no', 'id',
])

export const normaliseHeader = (h: string) => String(h ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

const MIN_DATE = '2015-01-01'
function maxDate(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Excel serial date → YYYY-MM-DD. Reached when someone opens the export, edits a
 * cell and lets Excel re-type the Date column as a real date on save. Day 1 is
 * 1900-01-01 and the sheet includes the mythical 1900-02-29, which is why the
 * epoch below is 1899-12-30.
 */
function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 100_000) return null
  const ms = Math.round(serial) * 86_400_000
  const d = new Date(Date.UTC(1899, 11, 30) + ms)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function parseDate(raw: unknown): { value: string } | { error: string } {
  if (typeof raw === 'number') {
    const iso = excelSerialToIso(raw)
    return iso ? { value: iso } : { error: 'not a valid date' }
  }
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    // Reject 2025-02-30: Date.parse accepts it and rolls it forward.
    const t = Date.parse(`${s}T00:00:00Z`)
    if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s) return { error: 'not a real date' }
    return { value: s }
  }
  // "27 Jul 2026" / "27-Jul-2026" — what a UK-locale Excel tends to produce.
  const m = s.match(/^(\d{1,2})[ \-/]([A-Za-z]{3,})[ \-/](\d{4})$/)
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase())
    if (mi >= 0) {
      const iso = `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
      const t = Date.parse(`${iso}T00:00:00Z`)
      if (!Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === iso) return { value: iso }
    }
  }
  // Deliberately no dd/mm/yy or mm/dd/yy: 03/04/2026 is ambiguous and guessing
  // wrong silently moves a charge to another month.
  if (/^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}$/.test(s)) {
    return { error: 'ambiguous date — use YYYY-MM-DD' }
  }
  return { error: 'not a valid date' }
}

function parseMoney(raw: unknown, signed: boolean): { value: number } | { error: string } {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { error: 'not a number' }
    return checkMoney(raw, signed)
  }
  // Strip currency symbols, thousands separators and stray spaces. Handles a
  // parenthesised negative, which is how Excel shows a credit.
  let s = String(raw).trim().replace(/[$,\s]/g, '')
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  if (s === '') return { error: 'empty' }
  if (!/^-?\d*\.?\d+$/.test(s)) return { error: 'not a number' }
  const n = Number(s) * (neg ? -1 : 1)
  return checkMoney(n, signed)
}

function checkMoney(n: number, signed: boolean): { value: number } | { error: string } {
  if (!signed && n < 0) return { error: 'cannot be negative' }
  if (n < -1_000_000 || n > 1_000_000) return { error: 'outside ±1,000,000' }
  // Two decimals to match numeric(12,2); more would be silently rounded by PG.
  return { value: Math.round(n * 100) / 100 }
}

export interface ParsedCell {
  /** null means "clear this field". */
  value: string | number | null
  error?: string
}

/** Resolve one cell against its field spec. `lookups` maps table → (lowercased name → id). */
export function parseCell(
  spec: FieldSpec,
  raw: unknown,
  lookups: Record<string, Map<string, string>>,
): ParsedCell {
  const isBlank = raw === null || raw === undefined || String(raw).trim() === ''

  if (isBlank) {
    if (!spec.nullable) return { value: null, error: `${spec.label} cannot be blank` }
    return { value: null }
  }

  switch (spec.kind) {
    case 'text': {
      const s = String(raw).trim()
      if (spec.maxLength && s.length > spec.maxLength) {
        return { value: null, error: `${spec.label} is longer than ${spec.maxLength} characters` }
      }
      return { value: s }
    }
    case 'money':
    case 'signedMoney': {
      const r = parseMoney(raw, spec.kind === 'signedMoney')
      return 'error' in r ? { value: null, error: `${spec.label}: ${r.error}` } : { value: r.value }
    }
    case 'date': {
      const r = parseDate(raw)
      if ('error' in r) return { value: null, error: `${spec.label}: ${r.error}` }
      if (r.value < MIN_DATE) return { value: null, error: `${spec.label} is before ${MIN_DATE}` }
      if (r.value > maxDate()) return { value: null, error: `${spec.label} is more than a year ahead` }
      return { value: r.value }
    }
    case 'enum': {
      const s = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_')
      if (!spec.values!.includes(s)) {
        return { value: null, error: `${spec.label} must be one of: ${spec.values!.join(', ')}` }
      }
      return { value: s }
    }
    case 'lookup': {
      const s = String(raw).trim()
      const id = lookups[spec.table!]?.get(s.toLowerCase())
      if (!id) {
        // Deliberately not auto-created: a typo would otherwise quietly add a
        // ninth category or a duplicate vendor across hundreds of rows.
        return { value: null, error: `${spec.label} "${s}" does not exist — add it under Settings → Lookups first` }
      }
      return { value: id }
    }
  }
}

export interface RowChange {
  column: string
  label: string
  from: unknown
  to: string | number | null
}

export interface ImportRowResult {
  /** 1-based row number in the file, counting the header as row 1. */
  row: number
  ref: string
  status: 'update' | 'unchanged' | 'error'
  changes: RowChange[]
  errors: string[]
}

export interface ImportSummary {
  /** Headers that matched a writable field. */
  usedColumns: string[]
  /** Headers present but not writable (generated/audit) — skipped silently. */
  ignoredColumns: string[]
  /** Headers matching nothing at all — worth telling the user about. */
  unknownColumns: string[]
  totalRows: number
  updates: number
  unchanged: number
  errors: number
  rows: ImportRowResult[]
}

/** Compare a parsed value against what is already stored. */
export function isSameValue(current: unknown, next: string | number | null): boolean {
  if (next === null) return current === null || current === undefined || current === ''
  if (typeof next === 'number') {
    if (current === null || current === undefined || current === '') return false
    return Math.abs(Number(current) - next) < 0.005
  }
  return String(current ?? '') === next
}
