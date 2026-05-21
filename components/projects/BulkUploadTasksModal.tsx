'use client'

import { useMemo, useRef, useState } from 'react'
import { X, Upload, Download, Check, AlertCircle, Copy } from 'lucide-react'
import * as XLSX from 'xlsx'
import type { ProjectOwner } from '@/types'

interface Props {
  projectId: string
  owner: ProjectOwner
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
  due_date: string | null
  dependency_task: string | null
  dependency_details: string | null
  dependency_status: string | null
  dependency_owner: string | null
  final_comments: string | null
  _error?: string
}

const FIELD_KEYS = [
  'title', 'description', 'status', 'priority', 'progress', 'due_date',
  'dependency_task', 'dependency_details', 'dependency_status', 'dependency_owner',
  'final_comments',
] as const
type FieldKey = typeof FIELD_KEYS[number]

const FIELD_LABELS: Record<FieldKey, string> = {
  title: 'Title (required)',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  progress: 'Progress %',
  due_date: 'Due Date',
  dependency_task: 'Dependency Task',
  dependency_details: 'Dependency Details',
  dependency_status: 'Dependency Status',
  dependency_owner: 'Dependency Owner',
  final_comments: 'Final Comments',
}

// Common header variants → canonical field
const HEADER_HINTS: Record<FieldKey, string[]> = {
  title: ['task name', 'task', 'title', 'name'],
  description: ['description', 'comments', 'notes', 'note', 'details', 'referance links', 'reference links', 'reference', 'url', 'link', 'page type'],
  status: ['status'],
  priority: ['priority'],
  progress: ['progress', 'progress %', 'progress percent', '%'],
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
    title: null, description: null, status: null, priority: null, progress: null, due_date: null,
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

const TEMPLATE_CSV = `Title,Description,Status,Priority,Progress,Due Date,Dependency Task,Dependency Details,Dependency Status,Dependency Owner,Final Comments
Header design,Build the responsive site header with sticky navigation,In Progress,High,40,2026-06-15,Brand guidelines sign-off,Need final logo + colour tokens before final pass,In Review,Marketing,Awaiting brand sign-off; once approved, can wrap in a day.
Footer revamp,Replace legacy footer with the new component,Pending,Medium,0,2026-06-20,,,,,
Homepage hero animation,Implement scroll-triggered hero section,Pending,High,0,2026-06-22,Hero copy approval,Awaiting final hero copy from content team,Pending,Content,Blocked until content team finalises copy.
SEO audit fixes,Apply remediations from the Q2 SEO audit,Completed,Medium,100,2026-05-30,,,,,Done — all audit items addressed.
Form validation refactor,Move all forms to react-hook-form + zod,In Progress,Critical,65,2026-06-10,API error contract,Backend needs to standardise validation error payload,In Progress,Backend,Frontend pieces done; integration paused on backend contract.
Sitemap & robots.txt,Generate and ship the production sitemap and robots,Pending,Low,0,2026-06-25,,,,,
`

export default function BulkUploadTasksModal({ projectId, owner, onClose, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Row[]>([])
  const [mapping, setMapping] = useState<Record<FieldKey, string | null>>({
    title: null, description: null, status: null, priority: null, progress: null, due_date: null,
    dependency_task: null, dependency_details: null, dependency_status: null, dependency_owner: null,
    final_comments: null,
  })
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ inserted: number } | null>(null)
  const [copied, setCopied] = useState(false)
  const [showTemplate, setShowTemplate] = useState(false)

  async function copyTemplate() {
    try {
      await navigator.clipboard.writeText(TEMPLATE_CSV)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API might be blocked — reveal the textarea so the user can copy manually.
      setShowTemplate(true)
    }
  }

  // Project owner is derived from the owner this upload is scoped to; we don't ask for it in the CSV.
  const projectOwnerName = owner.user?.full_name ?? '—'

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
    const mappedColumns = new Set(
      [mapping.title, mapping.description, mapping.status, mapping.priority,
        mapping.progress, mapping.due_date,
        mapping.dependency_task, mapping.dependency_details, mapping.dependency_status, mapping.dependency_owner,
        mapping.final_comments]
        .filter((v): v is string => !!v)
    )
    return rawRows.map(row => {
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
      const due_date = mapping.due_date ? parseDate(row[mapping.due_date]) : null
      const dependency_task = mapping.dependency_task ? (String(row[mapping.dependency_task] ?? '').trim() || null) : null
      const dependency_details = mapping.dependency_details ? (String(row[mapping.dependency_details] ?? '').trim() || null) : null
      const dependency_status = mapping.dependency_status ? (String(row[mapping.dependency_status] ?? '').trim() || null) : null
      const dependency_owner = mapping.dependency_owner ? (String(row[mapping.dependency_owner] ?? '').trim() || null) : null
      const final_comments = mapping.final_comments ? (String(row[mapping.final_comments] ?? '').trim() || null) : null

      const err = !title ? 'Title is empty' : undefined

      return {
        title, description, status, priority, progress, due_date,
        dependency_task, dependency_details, dependency_status, dependency_owner,
        final_comments,
        _error: err,
      }
    })
  }, [rawRows, mapping])

  const validRows = useMemo(() => mappedRows.filter(r => !r._error), [mappedRows])
  const importable = useMemo(() => mappedRows.filter(r => r.title), [mappedRows])
  const blockedCount = mappedRows.length - importable.length

  async function handleImport() {
    if (importable.length === 0) return
    setImporting(true)
    setError(null)
    const res = await fetch(`/api/projects/${projectId}/owners/${owner.id}/tasks/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: importable.map(r => ({
          title: r.title,
          description: r.description,
          status: r.status,
          priority: r.priority,
          progress: r.progress,
          due_date: r.due_date,
          dependency_task: r.dependency_task,
          dependency_details: r.dependency_details,
          dependency_status: r.dependency_status,
          dependency_owner: r.dependency_owner,
          final_comments: r.final_comments,
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
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-4xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Bulk Upload Tasks</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Importing under <strong>{owner.user?.full_name ?? '—'}</strong> ({owner.department})
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
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
              href="/api/templates/project-tasks"
              download="bulk-task-template.csv"
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Download size={15} />
              Download Template
            </a>
            <button
              type="button"
              onClick={copyTemplate}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              title="Copy CSV — paste into Notepad and save as .csv"
            >
              {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
              {copied ? 'Copied!' : 'Copy CSV'}
            </button>
            <button
              type="button"
              onClick={() => setShowTemplate(v => !v)}
              className="text-xs text-blue-600 hover:underline"
            >
              {showTemplate ? 'Hide template' : 'Show template'}
            </button>
            {rawRows.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {rawRows.length} rows parsed · {headers.length} columns
              </span>
            )}
          </div>

          {showTemplate && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                Select all (Ctrl+A) → Copy (Ctrl+C) → paste into Notepad → Save As <code>project-tasks-template.csv</code> (set "Save as type" to "All files").
              </p>
              <textarea
                readOnly
                value={TEMPLATE_CSV}
                rows={8}
                onFocus={e => e.currentTarget.select()}
                className="w-full font-mono text-xs px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg"
              />
            </div>
          )}

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
                    <tr className="text-left text-gray-500 dark:text-gray-400">
                      <th className="px-2 py-1.5 font-medium">Title</th>
                      <th className="px-2 py-1.5 font-medium">Status</th>
                      <th className="px-2 py-1.5 font-medium">Priority</th>
                      <th className="px-2 py-1.5 font-medium">Progress</th>
                      <th className="px-2 py-1.5 font-medium">Due</th>
                      <th className="px-2 py-1.5 font-medium">Project Owner</th>
                      <th className="px-2 py-1.5 font-medium">Dependency</th>
                      <th className="px-2 py-1.5 font-medium">Final Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappedRows.slice(0, 50).map((r, i) => (
                      <tr key={i} className={`border-t border-gray-100 dark:border-gray-800 ${r._error ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
                        <td className="px-2 py-1.5 text-gray-900 dark:text-white">{r.title || <span className="text-red-500">missing</span>}</td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 capitalize">{r.status.replace('_', ' ')}</td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 capitalize">{r.priority}</td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">{r.progress}%</td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">{r.due_date ?? '—'}</td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">{projectOwnerName}</td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">
                          {r.dependency_task ? (
                            <span title={[r.dependency_details, r.dependency_status, r.dependency_owner].filter(Boolean).join(' • ')}>
                              {r.dependency_task}
                              {r.dependency_owner && <span className="text-gray-400"> ({r.dependency_owner})</span>}
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 max-w-xs truncate" title={r.final_comments ?? undefined}>
                          {r.final_comments ?? <span className="text-gray-400">—</span>}
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
                  {blockedCount} row{blockedCount === 1 ? '' : 's'} will be skipped (missing title).
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
