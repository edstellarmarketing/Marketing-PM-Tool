import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireModuleManager } from '@/lib/api'
import {
  IGNORED_HEADERS, IMPORT_FIELDS, IMPORT_KEY_HEADER, isSameValue,
  normaliseHeader, parseCell,
  type FieldSpec, type ImportRowResult, type ImportSummary, type RowChange,
} from '@/lib/expense-import'

// Bulk edit of existing ledger rows from a spreadsheet, keyed on `ref`.
//
// Two calls, always in this order:
//   mode=preview  parse + validate + diff, write nothing
//   mode=apply    re-parse the file and write only the diffs
//
// The preview is not a token the client can replay: apply re-reads and re-validates
// the uploaded file from scratch. A client that skipped straight to apply would
// still get the same validation, and a row that changed in the database between
// the two calls is re-diffed against its current values rather than a stale copy.
//
// Manager-only. requireModuleManager covers the grantor account too, since the
// owner is always treated as a manager — a viewer gets a readable 403 and someone
// without a grant gets a 404.
export const dynamic = 'force-dynamic'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_ROWS = 5000
// Writes go one row at a time (each row changes a different set of columns), so
// cap concurrency rather than firing 1,295 requests at once.
const WRITE_CONCURRENCY = 8

type Db = ReturnType<typeof createAdminClient>

async function loadLookups(db: Db, tables: string[]): Promise<Record<string, Map<string, string>>> {
  const out: Record<string, Map<string, string>> = {}
  await Promise.all(tables.map(async table => {
    const { data } = await db.from(table).select('id, name')
    out[table] = new Map(((data ?? []) as { id: string; name: string }[])
      .map(r => [r.name.trim().toLowerCase(), r.id]))
  }))
  return out
}

interface Analysis {
  summary: ImportSummary
  /** ref → the columns to write. Only rows with status 'update'. */
  writes: Map<string, Record<string, string | number | null>>
}

async function analyse(file: File): Promise<Analysis | { error: string }> {
  const buf = Buffer.from(await file.arrayBuffer())

  let sheet: XLSX.WorkSheet
  try {
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, raw: true })
    if (!wb.SheetNames.length) return { error: 'That file has no sheets in it.' }
    sheet = wb.Sheets[wb.SheetNames[0]]
  } catch {
    return { error: 'Could not read that file. Save it as .csv or .xlsx and try again.' }
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true })
  if (rows.length === 0) return { error: 'That file has a header but no rows.' }
  if (rows.length > MAX_ROWS) return { error: `That file has ${rows.length} rows; the limit is ${MAX_ROWS}.` }

  // Header analysis from the sheet itself, not the first object — a column that is
  // empty in every row still matters, because including it means "clear this".
  const headerRow = (XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] ?? []) as unknown[]
  const headers = headerRow.map(h => String(h ?? '')).filter(h => h.trim() !== '')

  const usedColumns: string[] = []
  const ignoredColumns: string[] = []
  const unknownColumns: string[] = []
  // Original header text → spec, so row lookups keep the sheet's own casing.
  const active: { header: string; spec: FieldSpec }[] = []

  let keyHeader: string | null = null
  for (const h of headers) {
    const n = normaliseHeader(h)
    if (n === normaliseHeader(IMPORT_KEY_HEADER)) { keyHeader = h; continue }
    const spec = IMPORT_FIELDS[n]
    if (spec) { active.push({ header: h, spec }); usedColumns.push(spec.label) }
    else if (IGNORED_HEADERS.has(n)) ignoredColumns.push(h)
    else unknownColumns.push(h)
  }

  if (!keyHeader) {
    return { error: `No "${IMPORT_KEY_HEADER}" column found. Export the ledger first — the Ref column is how rows are matched.` }
  }
  if (active.length === 0) {
    return { error: 'No editable columns found. Keep at least one column besides Ref, for example Invoice URL.' }
  }

  const db = createAdminClient()
  const lookups = await loadLookups(db, [...new Set(active.map(a => a.spec.table).filter(Boolean) as string[])])

  // Fetch only the referenced rows, chunked to stay well inside URL limits.
  const refs = [...new Set(rows.map(r => String(r[keyHeader!] ?? '').trim()).filter(Boolean))]
  const columnsNeeded = [...new Set(active.map(a => a.spec.column))]
  const existing = new Map<string, Record<string, unknown>>()
  for (let i = 0; i < refs.length; i += 200) {
    const slice = refs.slice(i, i + 200)
    const { data, error } = await db
      .from('expenses')
      .select(['ref', 'deleted_at', ...columnsNeeded].join(', '))
      .in('ref', slice)
    if (error) return { error: error.message }
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
      existing.set(String(r.ref), r)
    }
  }

  const results: ImportRowResult[] = []
  const writes = new Map<string, Record<string, string | number | null>>()
  const seen = new Set<string>()

  rows.forEach((raw, i) => {
    const rowNo = i + 2 // header is row 1
    const ref = String(raw[keyHeader!] ?? '').trim()
    const errors: string[] = []
    const changes: RowChange[] = []

    if (!ref) {
      results.push({ row: rowNo, ref: '', status: 'error', changes: [], errors: ['No Ref — this row cannot be matched. Add expenses through the form, not the importer.'] })
      return
    }
    if (seen.has(ref)) {
      results.push({ row: rowNo, ref, status: 'error', changes: [], errors: [`${ref} appears more than once in this file.`] })
      return
    }
    seen.add(ref)

    const current = existing.get(ref)
    if (!current) {
      results.push({ row: rowNo, ref, status: 'error', changes: [], errors: [`${ref} does not exist in the ledger.`] })
      return
    }
    if (current.deleted_at) {
      results.push({ row: rowNo, ref, status: 'error', changes: [], errors: [`${ref} is in the recycle bin. Restore it before editing.`] })
      return
    }

    const patch: Record<string, string | number | null> = {}
    for (const { header, spec } of active) {
      const parsed = parseCell(spec, raw[header], lookups)
      if (parsed.error) { errors.push(parsed.error); continue }
      if (isSameValue(current[spec.column], parsed.value)) continue
      patch[spec.column] = parsed.value
      changes.push({ column: spec.column, label: spec.label, from: current[spec.column] ?? null, to: parsed.value })
    }

    if (errors.length) results.push({ row: rowNo, ref, status: 'error', changes, errors })
    else if (changes.length === 0) results.push({ row: rowNo, ref, status: 'unchanged', changes: [], errors: [] })
    else { results.push({ row: rowNo, ref, status: 'update', changes, errors: [] }); writes.set(ref, patch) }
  })

  return {
    summary: {
      usedColumns, ignoredColumns, unknownColumns,
      totalRows: rows.length,
      updates: results.filter(r => r.status === 'update').length,
      unchanged: results.filter(r => r.status === 'unchanged').length,
      errors: results.filter(r => r.status === 'error').length,
      rows: results,
    },
    writes,
  }
}

export async function POST(req: NextRequest) {
  const { profile, error } = await requireModuleManager('expenses')
  if (error || !profile) return error!

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected a file upload.' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file was attached.' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'That file is empty.' }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 10 MB.` }, { status: 413 })
  }

  const mode = form.get('mode') === 'apply' ? 'apply' : 'preview'

  const analysed = await analyse(file)
  if ('error' in analysed) return NextResponse.json({ error: analysed.error }, { status: 400 })
  const { summary, writes } = analysed

  if (mode === 'preview') return NextResponse.json({ mode, ...summary })

  // Refuse to apply a file with any bad row. Partially applying a spreadsheet is
  // the worst outcome: the user cannot tell which half landed.
  if (summary.errors > 0) {
    return NextResponse.json(
      { error: `${summary.errors} ${summary.errors === 1 ? 'row has' : 'rows have'} a problem. Nothing was changed — fix the file and preview again.`, ...summary },
      { status: 400 },
    )
  }
  if (writes.size === 0) return NextResponse.json({ mode, applied: 0, ...summary })

  const db = createAdminClient()
  const entries = [...writes.entries()]
  const failures: { ref: string; message: string }[] = []
  let applied = 0

  for (let i = 0; i < entries.length; i += WRITE_CONCURRENCY) {
    const batch = entries.slice(i, i + WRITE_CONCURRENCY)
    await Promise.all(batch.map(async ([ref, patch]) => {
      const { error: e } = await db
        .from('expenses')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('ref', ref)
        .is('deleted_at', null)
      if (e) failures.push({ ref, message: e.message })
      else applied++
    }))
  }

  return NextResponse.json({
    mode, applied, failed: failures.length, failures: failures.slice(0, 20), ...summary,
  })
}
