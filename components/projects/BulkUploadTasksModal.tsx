'use client'

import { useMemo, useRef, useState } from 'react'
import { X, Upload, Download, Check, AlertCircle, Loader2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import type { Profile, ProjectOwner, ProjectTaskGroup } from '@/types'

interface Props {
  projectId: string
  // Fixed destination owner (per-owner entry point). When omitted, the user
  // picks the destination department from `owners` inside the modal — this is
  // the project-level import.
  owner?: ProjectOwner
  owners?: ProjectOwner[]
  groups?: ProjectTaskGroup[]
  allMembers: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]
  onClose: () => void
  onImported: () => void
}

type Row = Record<string, string | number | null>

interface MappedRow {
  title: string
  description: string | null
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high' | 'critical'
  progress: number
  start_date: string | null
  due_date: string | null
  dependency_task: string | null
  dependency_details: string | null
  dependency_status: string | null
  dependency_owner_ids: string[]
  _depOwnerNames?: string[]
  _depOwnerUnmatched?: string[]
  final_comments: string | null
  group_name: string | null
  sort_order: number | null
  _rowIndex: number
  _error?: string
}

const FIELD_KEYS = [
  'sort_order',
  'title', 'group', 'description', 'status', 'priority', 'progress', 'start_date', 'due_date',
  'dependency_task', 'dependency_details', 'dependency_status', 'dependency_owner',
  'final_comments',
] as const
type FieldKey = typeof FIELD_KEYS[number]

const FIELD_LABELS: Record<FieldKey, string> = {
  sort_order: 'S.No (order)',
  title: 'Title (required)',
  group: 'Group / Phase',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  progress: 'Progress %',
  start_date: 'Start Date',
  due_date: 'Due Date',
  dependency_task: 'Dependency Task',
  dependency_details: 'Dependency Details',
  dependency_status: 'Dependency Status',
  dependency_owner: 'Dependency Owner',
  final_comments: 'Final Comments',
}

// Common header variants → canonical field
const HEADER_HINTS: Record<FieldKey, string[]> = {
  sort_order: ['s.no', 's no', 'sno', 'sl no', 'sl.no', 'sr no', 'sr.no', 'serial', 'serial no', 'serial number', '#', 'order', 'sort order', 'position', 'seq', 'sequence'],
  title: ['task name', 'task', 'title', 'name'],
  group: ['group', 'phase', 'section', 'stage', 'milestone', 'group name', 'phase name', 'task group'],
  description: ['description', 'comments', 'notes', 'note', 'details', 'referance links', 'reference links', 'reference', 'url', 'link', 'page type'],
  status: ['status'],
  priority: ['priority'],
  progress: ['progress', 'progress %', 'progress percent', '%'],
  start_date: ['start date', 'start', 'begin', 'begin date', 'kick off', 'kickoff'],
  due_date: ['due date', 'due', 'end date', 'end', 'deadline'],
  dependency_task: ['dependency task', 'dependency', 'depends on', 'blocked by', 'dependent task', 'dependency name'],
  dependency_details: ['dependency details', 'dependency description', 'dependency notes', 'dependency info'],
  dependency_status: ['dependency status', 'dep status', 'dependency state'],
  dependency_owner: ['dependency owner', 'dep owner', 'dependency assignee', 'dependency person', 'dependency contact'],
  final_comments: ['final comments', 'final comment', 'owner comments', 'wrap up', 'wrap-up', 'closing comments', 'summary'],
}

function normaliseHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, ' ')
}

function autoMap(headers: string[]): Record<FieldKey, string | null> {
  const out: Record<FieldKey, string | null> = {
    sort_order: null,
    title: null, group: null, description: null, status: null, priority: null, progress: null, start_date: null, due_date: null,
    dependency_task: null, dependency_details: null, dependency_status: null, dependency_owner: null,
    final_comments: null,
  }
  const norm = headers.map(h => ({ raw: h, norm: normaliseHeader(h) }))
  for (const key of FIELD_KEYS) {
    const hints = HEADER_HINTS[key]
    const found = norm.find(h => hints.some(hint => h.norm === hint))
      ?? norm.find(h => hints.some(hint => h.norm.includes(hint)))
    if (found) out[key] = found.raw
  }
  return out
}

function parseStatus(raw: unknown): MappedRow['status'] {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return 'pending'
  if (s === 'done' || s === 'completed' || s === 'complete' || s === 'closed' || s === 'finished') return 'completed'
  if (s === 'in progress' || s === 'in_progress' || s === 'in review' || s === 'review' || s === 'ongoing' || s === 'working' || s === 'wip') return 'in_progress'
  return 'pending'
}

function parsePriority(raw: unknown): MappedRow['priority'] {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'critical' || s === 'urgent' || s === 'p0') return 'critical'
  if (s === 'high' || s === 'p1') return 'high'
  if (s === 'low' || s === 'p3') return 'low'
  return 'medium'
}

function parseSortOrder(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.floor(n))
}

function parseProgress(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace('%', ''))
  if (!Number.isFinite(n)) return 0
  const v = n <= 1 ? Math.round(n * 100) : Math.round(n)
  return Math.max(0, Math.min(100, v))
}

function parseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  // Excel serial date
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    if (d && d.y) {
      const yyyy = String(d.y).padStart(4, '0')
      const mm = String(d.m).padStart(2, '0')
      const dd = String(d.d).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}`
    }
  }
  const s = String(raw).trim()
  if (!s) return null
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // d-MMM-yyyy (e.g. 20-Apr-2026) or d MMM yyyy
  const m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{4})$/)
  if (m) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    }
    const mm = months[m[2].slice(0, 3).toLowerCase()]
    if (mm) return `${m[3]}-${mm}-${m[1].padStart(2, '0')}`
  }
  // Fallback to Date parser
  const d = new Date(s)
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
  return null
}

export default function BulkUploadTasksModal({ projectId, owner, owners = [], allMembers, onClose, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  // When a fixed owner is passed we lock to it; otherwise the user chooses one.
  // If the project has exactly one department, pre-select it so single-team
  // projects import without an extra click.
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>(
    owner?.id ?? (owners.length === 1 ? owners[0].id : ''),
  )
  const activeOwner = owner ?? owners.find(o => o.id === selectedOwnerId) ?? null
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Row[]>([])
  const [mapping, setMapping] = useState<Record<FieldKey, string | null>>({
    sort_order: null,
    title: null, group: null, description: null, status: null, priority: null, progress: null, start_date: null, due_date: null,
    dependency_task: null, dependency_details: null, dependency_status: null, dependency_owner: null,
    final_comments: null,
  })
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ inserted: number } | null>(null)
  // Live import progress: how many tasks have been inserted so far, and the
  // current phase label. Null when no import is running.
  const [progress, setProgress] = useState<{ done: number; total: number; phase: string } | null>(null)
  // Per-row overrides for unmatched dependency owners. Keyed by row index in
  // rawRows, value is the chosen user id for the first unmatched name. ''
  // means "leave unassigned".
  const [depOwnerOverrides, setDepOwnerOverrides] = useState<Record<number, string>>({})

  // Project owner is derived from the destination owner this upload is scoped to;
  // we don't ask for it in the CSV.
  const projectOwnerName = activeOwner?.user?.full_name ?? '—'

  function resolveProfile(raw: unknown): string | null {
    const s = String(raw ?? '').trim().toLowerCase()
    if (!s) return null
    const hit = allMembers.find(m => m.full_name.toLowerCase() === s)
      ?? allMembers.find(m => m.full_name.toLowerCase().startsWith(s))
      ?? allMembers.find(m => m.full_name.toLowerCase().includes(s))
    return hit?.id ?? null
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setResult(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Row>(sheet, { defval: '', raw: true })
      if (json.length === 0) {
        setError('No rows found in the file')
        return
      }
      const hdrs = Object.keys(json[0])
      setHeaders(hdrs)
      setRawRows(json)
      setMapping(autoMap(hdrs))
      setDepOwnerOverrides({})
    } catch (err) {
      setError('Could not parse file. Use .csv, .xlsx, or .xls')
    }
  }

  const mappedRows = useMemo<MappedRow[]>(() => {
    if (!mapping.title) return []
    const mappedColumns = new Set(
      [mapping.sort_order, mapping.title, mapping.group, mapping.description, mapping.status, mapping.priority,
        mapping.progress, mapping.start_date, mapping.due_date,
        mapping.dependency_task, mapping.dependency_details, mapping.dependency_status, mapping.dependency_owner,
        mapping.final_comments]
        .filter((v): v is string => !!v)
    )
    return rawRows.map((row, rowIndex) => {
      const title = String(row[mapping.title!] ?? '').trim()
      // Pull additional context columns into the description if present
      const descParts: string[] = []
      if (mapping.description) {
        const v = row[mapping.description]
        if (v !== null && v !== undefined && String(v).trim()) descParts.push(String(v).trim())
      }
      // Always pull reference/url and page-type-style columns when not mapped explicitly
      Object.entries(row).forEach(([k, v]) => {
        if (mappedColumns.has(k)) return
        if (v === null || v === undefined || String(v).trim() === '') return
        const norm = normaliseHeader(k)
        if (/(referance|reference|link|url|page type|category|comments|notes)/.test(norm)) {
          descParts.push(`${k}: ${String(v).trim()}`)
        }
      })
      const description = descParts.length ? descParts.join('\n\n') : null
      const status = mapping.status ? parseStatus(row[mapping.status]) : 'pending'
      const priority = mapping.priority ? parsePriority(row[mapping.priority]) : 'medium'
      const progress = mapping.progress ? parseProgress(row[mapping.progress]) : (status === 'completed' ? 100 : 0)
      const start_date = mapping.start_date ? parseDate(row[mapping.start_date]) : null
      const due_date = mapping.due_date ? parseDate(row[mapping.due_date]) : null
      const dependency_task = mapping.dependency_task ? (String(row[mapping.dependency_task] ?? '').trim() || null) : null
      const dependency_details = mapping.dependency_details ? (String(row[mapping.dependency_details] ?? '').trim() || null) : null
      const dependency_status = mapping.dependency_status ? (String(row[mapping.dependency_status] ?? '').trim() || null) : null
      const depOwnerRaw = mapping.dependency_owner ? String(row[mapping.dependency_owner] ?? '').trim() : ''
      const rawNames = depOwnerRaw
        ? depOwnerRaw.split(/\s*[,;|]\s*|\s*\/\s*|\s+and\s+/i).map(s => s.trim()).filter(Boolean)
        : []
      const resolvedIds: string[] = []
      const unmatched: string[] = []
      rawNames.forEach(name => {
        const id = resolveProfile(name)
        if (id && !resolvedIds.includes(id)) resolvedIds.push(id)
        else if (!id) unmatched.push(name)
      })
      // Per-row override picks a user for any unmatched names. '' = leave unassigned.
      if (rowIndex in depOwnerOverrides) {
        const override = depOwnerOverrides[rowIndex]
        if (override && !resolvedIds.includes(override)) resolvedIds.push(override)
      }
      const dependency_owner_ids = resolvedIds
      const final_comments = mapping.final_comments ? (String(row[mapping.final_comments] ?? '').trim() || null) : null
      const group_name = mapping.group ? (String(row[mapping.group] ?? '').trim() || null) : null
      const sort_order = mapping.sort_order ? parseSortOrder(row[mapping.sort_order]) : null

      const err = !title ? 'Title is empty' : undefined

      return {
        title, description, status, priority, progress, start_date, due_date,
        dependency_task, dependency_details, dependency_status, dependency_owner_ids,
        _depOwnerNames: rawNames,
        _depOwnerUnmatched: unmatched,
        final_comments,
        group_name,
        sort_order,
        _rowIndex: rowIndex,
        _error: err,
      }
    })
  }, [rawRows, mapping, allMembers, depOwnerOverrides])

  const validRows = useMemo(() => mappedRows.filter(r => !r._error), [mappedRows])
  // Sort by S.No (ascending) so the bulk insert order matches the user's intent.
  // Rows without an explicit S.No keep their file order via `_rowIndex` as a tiebreaker;
  // they sort after any rows that did provide one.
  const importable = useMemo(() => {
    const rows = mappedRows.filter(r => r.title)
    return [...rows].sort((a, b) => {
      const aHas = a.sort_order !== null
      const bHas = b.sort_order !== null
      if (aHas && bHas) {
        if (a.sort_order! !== b.sort_order!) return a.sort_order! - b.sort_order!
        return a._rowIndex - b._rowIndex
      }
      if (aHas) return -1
      if (bHas) return 1
      return a._rowIndex - b._rowIndex
    })
  }, [mappedRows])
  const blockedCount = mappedRows.length - importable.length

  async function handleImport() {
    if (importable.length === 0) return
    if (!activeOwner) { setError('Choose a destination department first.'); return }
    setImporting(true)
    setError(null)
    setResult(null)
    setProgress({ done: 0, total: importable.length, phase: 'Preparing…' })

    try {
      // 1) Resolve each row's Group name to a group_id, creating any group that
      // doesn't already exist on the project (case-insensitive match).
      const groupIdByName = new Map<string, string>()
      groups.forEach(g => groupIdByName.set(g.name.trim().toLowerCase(), g.id))
      const neededNames = Array.from(
        new Set(
          importable
            .map(r => r.group_name?.trim())
            .filter((n): n is string => !!n)
            .map(n => n.toLowerCase()),
        ),
      ).filter(lower => !groupIdByName.has(lower))
      if (neededNames.length > 0) {
        setProgress({ done: 0, total: importable.length, phase: 'Creating groups…' })
        for (const lower of neededNames) {
          // Preserve original casing using the first row that used the name.
          const original = importable.find(r => r.group_name?.trim().toLowerCase() === lower)?.group_name?.trim()
          if (!original) continue
          const gRes = await fetch(`/api/projects/${projectId}/groups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: original }),
          })
          if (gRes.ok) {
            const g = await gRes.json()
            groupIdByName.set(lower, g.id)
          }
        }
      }

      // 2) Insert in small sequential batches so the progress bar advances and
      // no single request can stall the whole import. `importable` is already
      // sorted by S.No, and each batch appends after the previous (server sets
      // sort_order from MAX+1), so global order is preserved.
      const payloadRows = importable.map(r => ({
        title: r.title,
        group_id: r.group_name ? (groupIdByName.get(r.group_name.trim().toLowerCase()) ?? null) : null,
        description: r.description,
        status: r.status,
        priority: r.priority,
        progress: r.progress,
        start_date: r.start_date,
        due_date: r.due_date,
        dependency_task: r.dependency_task,
        dependency_details: r.dependency_details,
        dependency_status: r.dependency_status,
        dependency_owner_ids: r.dependency_owner_ids.length > 0 ? r.dependency_owner_ids : null,
        final_comments: r.final_comments,
        sort_order: r.sort_order,
      }))

      const CHUNK = 25
      let inserted = 0
      for (let i = 0; i < payloadRows.length; i += CHUNK) {
        const chunk = payloadRows.slice(i, i + CHUNK)
        setProgress({ done: inserted, total: payloadRows.length, phase: 'Importing tasks…' })
        const res = await fetch(`/api/projects/${projectId}/owners/${activeOwner.id}/tasks/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(
            typeof data.error === 'string'
              ? data.error
              : `Failed to import (batch starting at row ${i + 1}). ${inserted} task${inserted === 1 ? '' : 's'} imported before the error.`,
          )
        }
        const data = await res.json().catch(() => ({}))
        inserted += typeof data.inserted === 'number' ? data.inserted : chunk.length
        setProgress({ done: inserted, total: payloadRows.length, phase: 'Importing tasks…' })
      }

      setResult({ inserted })
      // Show the success message briefly, then close + refresh the project.
      setTimeout(() => { onImported() }, 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import tasks')
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-4xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Bulk Upload Tasks</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {activeOwner
                ? <>Importing under <strong>{activeOwner.user?.full_name ?? '—'}</strong> ({activeOwner.department})</>
                : 'Choose a destination department below, then upload your file.'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Destination department (project-level import only) */}
          {!owner && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Destination department *</label>
              <select
                value={selectedOwnerId}
                onChange={e => setSelectedOwnerId(e.target.value)}
                className="w-full max-w-md px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select department…</option>
                {owners.map(o => (
                  <option key={o.id} value={o.id}>{o.department} — {o.user?.full_name ?? 'Unknown'}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                All imported tasks are assigned to this department/owner. Use the <strong>Group</strong> column in the file to organize them into phases.
              </p>
            </div>
          )}

          {/* Step 1: File picker / template */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              <Upload size={15} />
              Choose CSV / Excel
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={onFile}
              className="hidden"
            />
            <a
              href="/api/templates/project-tasks-xlsx"
              download="bulk-task-template.xlsx"
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Download size={15} />
              Excel Template
            </a>
            {rawRows.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {rawRows.length} rows parsed · {headers.length} columns
              </span>
            )}
          </div>

          {error && (
            <p className="flex items-start gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              {error}
            </p>
          )}

          {/* Live progress bar while importing */}
          {importing && progress && (
            <div className="rounded-lg border border-blue-100 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-3 py-2.5">
              <div className="flex items-center justify-between text-xs text-blue-900 dark:text-blue-200 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Loader2 size={13} className="animate-spin" />
                  {progress.phase}
                </span>
                <span className="font-medium tabular-nums">{progress.done} / {progress.total}</span>
              </div>
              <div className="h-2 bg-blue-100 dark:bg-blue-900/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-200"
                  style={{ width: `${progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {result && (
            <p className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">
              <Check size={14} className="mt-0.5 flex-shrink-0" />
              Imported {result.inserted} task{result.inserted === 1 ? '' : 's'} successfully. Closing…
            </p>
          )}

          {/* Step 2: Column mapping */}
          {headers.length > 0 && !result && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Column mapping</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                We auto-detect headers from your file. Adjust any field below if it picked the wrong column.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {FIELD_KEYS.map(key => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{FIELD_LABELS[key]}</label>
                    <select
                      value={mapping[key] ?? ''}
                      onChange={e => setMapping(p => ({ ...p, [key]: e.target.value || null }))}
                      className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded"
                    >
                      <option value="">— Not in file —</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {!mapping.title && (
                <p className="text-xs text-red-600 mt-2">Pick the column that contains the task title to enable import.</p>
              )}
            </div>
          )}

          {/* Step 3: Preview */}
          {mappedRows.length > 0 && !result && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                Preview ({importable.length} importable · {blockedCount} skipped)
              </h3>
              <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                    <tr className="text-left text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      <th className="px-2 py-1.5 font-medium">S.No</th>
                      <th className="px-2 py-1.5 font-medium">Title</th>
                      <th className="px-2 py-1.5 font-medium">Group</th>
                      <th className="px-2 py-1.5 font-medium">Status</th>
                      <th className="px-2 py-1.5 font-medium">Priority</th>
                      <th className="px-2 py-1.5 font-medium">Progress</th>
                      <th className="px-2 py-1.5 font-medium">Start</th>
                      <th className="px-2 py-1.5 font-medium">Due</th>
                      <th className="px-2 py-1.5 font-medium">Project Owner</th>
                      <th className="px-2 py-1.5 font-medium">Dep. Task</th>
                      <th className="px-2 py-1.5 font-medium">Dep. Details</th>
                      <th className="px-2 py-1.5 font-medium">Dep. Status</th>
                      <th className="px-2 py-1.5 font-medium">Dep. Owner</th>
                      <th className="px-2 py-1.5 font-medium">Final Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappedRows.slice(0, 50).map((r, i) => {
                      const names = r._depOwnerNames ?? []
                      const unmatched = r._depOwnerUnmatched ?? []
                      const hasUnmatched = unmatched.length > 0
                      return (
                        <tr key={i} className={`border-t border-gray-100 dark:border-gray-800 ${r._error ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
                          <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.sort_order ?? <span className="text-gray-400" title="No S.No in the file — will fall back to row order">{i + 1}*</span>}</td>
                          <td className="px-2 py-1.5 text-gray-900 dark:text-white">{r.title || <span className="text-red-500">missing</span>}</td>
                          <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.group_name ?? <span className="text-gray-400">—</span>}</td>
                          <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 capitalize whitespace-nowrap">{r.status.replace('_', ' ')}</td>
                          <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 capitalize">{r.priority}</td>
                          <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">{r.progress}%</td>
                          <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.start_date ?? '—'}</td>
                          <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.due_date ?? '—'}</td>
                          <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{projectOwnerName}</td>
                          <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">{r.dependency_task ?? <span className="text-gray-400">—</span>}</td>
                          <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 max-w-xs truncate" title={r.dependency_details ?? undefined}>
                            {r.dependency_details ?? <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.dependency_status ?? <span className="text-gray-400">—</span>}</td>
                          <td className="px-2 py-1.5 whitespace-normal">
                            {names.length === 0 ? (
                              <span className="text-gray-400">—</span>
                            ) : (
                              <div className="flex flex-wrap items-center gap-1" title={`From file: "${names.join(', ')}"`}>
                                {r.dependency_owner_ids.map(id => {
                                  const m = allMembers.find(x => x.id === id)
                                  return (
                                    <span key={id} className="px-1.5 py-0.5 text-[11px] bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded">
                                      {m?.full_name ?? 'Unknown'}
                                    </span>
                                  )
                                })}
                                {hasUnmatched && (
                                  <select
                                    value={depOwnerOverrides[i] ?? ''}
                                    onChange={e => setDepOwnerOverrides(prev => ({ ...prev, [i]: e.target.value }))}
                                    className="text-xs px-1.5 py-0.5 border border-amber-400 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 rounded"
                                    title={`Unmatched: ${unmatched.join(', ')}`}
                                  >
                                    <option value="">— Pick for "{unmatched.join(', ')}" —</option>
                                    {allMembers.map(m => (
                                      <option key={m.id} value={m.id}>{m.full_name}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 max-w-xs truncate" title={r.final_comments ?? undefined}>
                            {r.final_comments ?? <span className="text-gray-400">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {mappedRows.length > 50 && (
                <p className="text-xs text-gray-500 mt-1">Showing first 50 of {mappedRows.length} rows.</p>
              )}
              {blockedCount > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                  {blockedCount} row{blockedCount === 1 ? '' : 's'} will be skipped (missing title).
                </p>
              )}
              {(() => {
                const rowsWithUnmatched = mappedRows.filter(r => (r._depOwnerUnmatched?.length ?? 0) > 0).length
                if (rowsWithUnmatched === 0) return null
                return (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                    {rowsWithUnmatched} row{rowsWithUnmatched === 1 ? '' : 's'} have a Dependency Owner name that doesn't match any user. Use the dropdown in the Dep. Owner column to pick a user, or leave unassigned to import without one. Multiple owners can be comma-separated in the file (e.g. <code>Lokesh, Vimala Nayuni</code>).
                  </p>
                )
              })()}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {result ? (
            <button
              onClick={onImported}
              className="px-5 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
            >
              Done
            </button>
          ) : (
            <button
              onClick={handleImport}
              disabled={importing || importable.length === 0 || !mapping.title || !activeOwner}
              title={!activeOwner ? 'Choose a destination department first' : undefined}
              className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              {importing
                ? (progress ? `Importing… ${progress.done}/${progress.total}` : 'Importing…')
                : `Import ${importable.length} task${importable.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
