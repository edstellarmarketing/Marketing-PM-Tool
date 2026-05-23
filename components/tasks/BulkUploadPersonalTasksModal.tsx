'use client'

import { useMemo, useRef, useState } from 'react'
import { X, Upload, Download, Check, AlertCircle } from 'lucide-react'
import * as XLSX from 'xlsx'
import type { PointConfig, SubTask } from '@/types'

interface Props {
  pointConfigs: PointConfig[]
  categoryNames: string[]
  onClose: () => void
  onImported: () => void
}

type Row = Record<string, string | number | null>

interface MappedRow {
  title: string
  description: string | null
  category: string | null
  priority: 'low' | 'medium' | 'high' | 'critical'
  task_type: string | null
  complexity: string | null
  start_date: string | null
  due_date: string | null
  subtasks: SubTask[]
  sort_order: number | null
  _categoryUnmatched: string | null
  _taskTypeUnmatched: string | null
  _complexityUnmatched: string | null
  _rowIndex: number
  _error?: string
}

const FIELD_KEYS = [
  'sort_order',
  'title', 'description', 'category', 'priority',
  'task_type', 'complexity',
  'start_date', 'due_date',
  'subtasks',
] as const
type FieldKey = typeof FIELD_KEYS[number]

const FIELD_LABELS: Record<FieldKey, string> = {
  sort_order: 'S.No (order)',
  title: 'Title (required)',
  description: 'Description',
  category: 'Category',
  priority: 'Priority',
  task_type: 'Task Type',
  complexity: 'Complexity',
  start_date: 'Start Date',
  due_date: 'Due Date',
  subtasks: 'Sub-tasks (comma-separated)',
}

const HEADER_HINTS: Record<FieldKey, string[]> = {
  sort_order: ['s.no', 's no', 'sno', 'sl no', 'sl.no', 'sr no', 'sr.no', 'serial', 'serial no', 'serial number', '#', 'order', 'sort order', 'position', 'seq', 'sequence'],
  title: ['task name', 'task', 'title', 'name'],
  description: ['description', 'details', 'notes', 'note', 'comments'],
  category: ['category', 'cat'],
  priority: ['priority'],
  task_type: ['task type', 'type', 'tasktype'],
  complexity: ['complexity', 'difficulty'],
  start_date: ['start date', 'start', 'begin', 'begin date', 'kick off', 'kickoff'],
  due_date: ['due date', 'due', 'end date', 'end', 'deadline'],
  subtasks: ['sub-tasks', 'sub tasks', 'subtasks', 'checklist', 'sub task', 'sub-task', 'checklist items'],
}

function normaliseHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, ' ')
}

function autoMap(headers: string[]): Record<FieldKey, string | null> {
  const out: Record<FieldKey, string | null> = {
    sort_order: null,
    title: null, description: null, category: null, priority: null,
    task_type: null, complexity: null,
    start_date: null, due_date: null,
    subtasks: null,
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

function parseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{4})$/)
  if (m) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    }
    const mm = months[m[2].slice(0, 3).toLowerCase()]
    if (mm) return `${m[3]}-${mm}-${m[1].padStart(2, '0')}`
  }
  const d = new Date(s)
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }
  return null
}

function parseSubtaskList(raw: unknown): SubTask[] {
  if (raw === null || raw === undefined) return []
  const s = String(raw).trim()
  if (!s) return []
  return s.split(',').map(t => t.trim()).filter(Boolean).map(title => ({
    id: crypto.randomUUID(),
    title,
    completed: false,
    due_date: null,
  }))
}

export default function BulkUploadPersonalTasksModal({ pointConfigs, categoryNames, onClose, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Row[]>([])
  const [mapping, setMapping] = useState<Record<FieldKey, string | null>>({
    sort_order: null,
    title: null, description: null, category: null, priority: null,
    task_type: null, complexity: null,
    start_date: null, due_date: null,
    subtasks: null,
  })
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ inserted: number } | null>(null)

  // Build lookup sets for fuzzy-matching category / task_type / complexity values.
  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>()
    categoryNames.forEach(name => map.set(name.toLowerCase(), name))
    return map
  }, [categoryNames])

  const taskTypeKeys = useMemo(() => {
    return pointConfigs
      .filter(c => c.category === 'task_type' && c.config_key.startsWith('task_type_'))
      .map(c => c.config_key.replace(/^task_type_/, ''))
  }, [pointConfigs])

  const taskTypeLookup = useMemo(() => {
    const map = new Map<string, string>()
    pointConfigs
      .filter(c => c.category === 'task_type' && c.config_key.startsWith('task_type_'))
      .forEach(c => {
        const key = c.config_key.replace(/^task_type_/, '')
        map.set(key.toLowerCase(), key)
        if (c.label) map.set(c.label.trim().toLowerCase(), key)
      })
    return map
  }, [pointConfigs])

  const complexityKeys = useMemo(() => {
    return pointConfigs
      .filter(c => c.category === 'complexity' && c.config_key.startsWith('complexity_'))
      .map(c => c.config_key.replace(/^complexity_/, ''))
  }, [pointConfigs])

  const complexityLookup = useMemo(() => {
    const map = new Map<string, string>()
    pointConfigs
      .filter(c => c.category === 'complexity' && c.config_key.startsWith('complexity_'))
      .forEach(c => {
        const key = c.config_key.replace(/^complexity_/, '')
        map.set(key.toLowerCase(), key)
        if (c.label) map.set(c.label.trim().toLowerCase(), key)
      })
    return map
  }, [pointConfigs])

  function resolveCategory(raw: unknown): { value: string | null; unmatched: string | null } {
    const s = String(raw ?? '').trim()
    if (!s) return { value: null, unmatched: null }
    const exact = categoryLookup.get(s.toLowerCase())
    if (exact) return { value: exact, unmatched: null }
    for (const [key, val] of categoryLookup) {
      if (key.startsWith(s.toLowerCase()) || s.toLowerCase().includes(key)) return { value: val, unmatched: null }
    }
    return { value: null, unmatched: s }
  }

  function resolveTaskType(raw: unknown): { value: string | null; unmatched: string | null } {
    const s = String(raw ?? '').trim()
    if (!s) return { value: null, unmatched: null }
    const hit = taskTypeLookup.get(s.toLowerCase())
    return hit ? { value: hit, unmatched: null } : { value: null, unmatched: s }
  }

  function resolveComplexity(raw: unknown): { value: string | null; unmatched: string | null } {
    const s = String(raw ?? '').trim()
    if (!s) return { value: null, unmatched: null }
    const hit = complexityLookup.get(s.toLowerCase())
    return hit ? { value: hit, unmatched: null } : { value: null, unmatched: s }
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
    } catch (err) {
      setError('Could not parse file. Use .csv, .xlsx, or .xls')
    }
  }

  const mappedRows = useMemo<MappedRow[]>(() => {
    if (!mapping.title) return []
    return rawRows.map((row, rowIndex) => {
      const title = String(row[mapping.title!] ?? '').trim()
      const description = mapping.description ? (String(row[mapping.description] ?? '').trim() || null) : null
      const cat = mapping.category ? resolveCategory(row[mapping.category]) : { value: null, unmatched: null }
      const priority = mapping.priority ? parsePriority(row[mapping.priority]) : 'medium'
      const tt = mapping.task_type ? resolveTaskType(row[mapping.task_type]) : { value: null, unmatched: null }
      const cx = mapping.complexity ? resolveComplexity(row[mapping.complexity]) : { value: null, unmatched: null }
      const start_date = mapping.start_date ? parseDate(row[mapping.start_date]) : null
      const due_date = mapping.due_date ? parseDate(row[mapping.due_date]) : null
      const subtasks = mapping.subtasks ? parseSubtaskList(row[mapping.subtasks]) : []
      const sort_order = mapping.sort_order ? parseSortOrder(row[mapping.sort_order]) : null

      let err: string | undefined
      if (!title) err = 'Title is empty'
      else if (start_date && due_date && start_date > due_date) err = 'Start date is after due date'

      return {
        title,
        description,
        category: cat.value,
        priority,
        task_type: tt.value,
        complexity: cx.value,
        start_date,
        due_date,
        subtasks,
        sort_order,
        _categoryUnmatched: cat.unmatched,
        _taskTypeUnmatched: tt.unmatched,
        _complexityUnmatched: cx.unmatched,
        _rowIndex: rowIndex,
        _error: err,
      }
    })
  }, [rawRows, mapping, categoryLookup, taskTypeLookup, complexityLookup])

  // Sort by S.No (ascending), file order as the tiebreaker. Rows without an explicit
  // S.No sort after any that did.
  const importable = useMemo(() => {
    const rows = mappedRows.filter(r => !r._error && r.title)
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
    setImporting(true)
    setError(null)
    const res = await fetch('/api/tasks/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: importable.map(r => ({
          title: r.title,
          description: r.description,
          category: r.category,
          priority: r.priority,
          task_type: r.task_type,
          complexity: r.complexity,
          start_date: r.start_date,
          due_date: r.due_date,
          subtasks: r.subtasks.length > 0 ? r.subtasks : null,
          sort_order: r.sort_order,
        })),
      }),
    })
    setImporting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data.error === 'string' ? data.error : 'Failed to import tasks')
      return
    }
    const data = await res.json()
    setResult({ inserted: data.inserted ?? 0 })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-5xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Bulk Upload Tasks</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Imported under your account. Dependencies aren't part of this template — add them per-task on the New Task page.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
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
              href="/api/templates/tasks-xlsx"
              download="bulk-tasks-template.xlsx"
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

          {result && (
            <p className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">
              <Check size={14} className="mt-0.5 flex-shrink-0" />
              Imported {result.inserted} task{result.inserted === 1 ? '' : 's'}.
            </p>
          )}

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

          {mappedRows.length > 0 && !result && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                Preview ({importable.length} importable · {blockedCount} skipped)
              </h3>
              <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-auto max-h-72">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                    <tr className="text-left text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      <th className="px-2 py-1.5 font-medium">S.No</th>
                      <th className="px-2 py-1.5 font-medium">Title</th>
                      <th className="px-2 py-1.5 font-medium">Category</th>
                      <th className="px-2 py-1.5 font-medium">Priority</th>
                      <th className="px-2 py-1.5 font-medium">Task Type</th>
                      <th className="px-2 py-1.5 font-medium">Complexity</th>
                      <th className="px-2 py-1.5 font-medium">Start</th>
                      <th className="px-2 py-1.5 font-medium">Due</th>
                      <th className="px-2 py-1.5 font-medium">Sub-tasks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappedRows.slice(0, 50).map((r, i) => (
                      <tr key={i} className={`border-t border-gray-100 dark:border-gray-800 ${r._error ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.sort_order ?? <span className="text-gray-400" title="No S.No — falls back to row order">{i + 1}*</span>}</td>
                        <td className="px-2 py-1.5 text-gray-900 dark:text-white">
                          {r.title || <span className="text-red-500">missing</span>}
                          {r._error && r.title && <span className="text-amber-600 text-[10px] ml-2">{r._error}</span>}
                        </td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {r.category ?? (r._categoryUnmatched
                            ? <span className="text-amber-600" title={`No defined category matches "${r._categoryUnmatched}" — will be left blank`}>"{r._categoryUnmatched}"</span>
                            : <span className="text-gray-400">—</span>)}
                        </td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 capitalize">{r.priority}</td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {r.task_type ?? (r._taskTypeUnmatched
                            ? <span className="text-amber-600" title={`No active task type matches "${r._taskTypeUnmatched}" — will be left blank`}>"{r._taskTypeUnmatched}"</span>
                            : <span className="text-gray-400">—</span>)}
                        </td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {r.complexity ?? (r._complexityUnmatched
                            ? <span className="text-amber-600" title={`No active complexity matches "${r._complexityUnmatched}" — will be left blank`}>"{r._complexityUnmatched}"</span>
                            : <span className="text-gray-400">—</span>)}
                        </td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.start_date ?? '—'}</td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.due_date ?? '—'}</td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 max-w-[18rem] truncate" title={r.subtasks.map(s => s.title).join(', ')}>
                          {r.subtasks.length === 0 ? <span className="text-gray-400">—</span> : `${r.subtasks.length} item${r.subtasks.length === 1 ? '' : 's'}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mappedRows.length > 50 && (
                <p className="text-xs text-gray-500 mt-1">Showing first 50 of {mappedRows.length} rows.</p>
              )}
              {blockedCount > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                  {blockedCount} row{blockedCount === 1 ? '' : 's'} will be skipped (missing title or invalid dates).
                </p>
              )}
              {(taskTypeKeys.length > 0 || complexityKeys.length > 0) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Accepted task types: <code>{taskTypeKeys.join(', ') || '—'}</code>. Accepted complexities: <code>{complexityKeys.join(', ') || '—'}</code>. Categories: <code>{categoryNames.slice(0, 6).join(', ')}{categoryNames.length > 6 ? ', …' : ''}</code>.
                </p>
              )}
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
              disabled={importing || importable.length === 0 || !mapping.title}
              className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload size={15} />
              {importing ? 'Importing…' : `Import ${importable.length} task${importable.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
