'use client'

import { useMemo, useRef, useState } from 'react'
import { X, Upload, Download, Check, AlertCircle, Copy, ExternalLink } from 'lucide-react'
import * as XLSX from 'xlsx'

interface UserInfo {
  id: string
  full_name: string
  avatar_url?: string | null
}

interface Props {
  user: UserInfo
  year: number
  month: number
  section: 'start' | 'end'
  onClose: () => void
  onImported: (rows: MappedRow[]) => void
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

type Row = Record<string, string | number | null>

export interface MappedRow {
  title: string
  description: string | null
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high' | 'critical'
  progress: number
  start_date: string | null
  due_date: string | null
  final_comments: string | null
  _error?: string
}

const FIELD_KEYS = [
  'title', 'description', 'status', 'priority', 'progress', 'start_date', 'due_date', 'final_comments',
] as const
type FieldKey = typeof FIELD_KEYS[number]

const FIELD_LABELS: Record<FieldKey, string> = {
  title: 'Title (required)',
  description: 'Description',
  status: 'Status',
  priority: 'Priority',
  progress: 'Progress %',
  start_date: 'Start Date',
  due_date: 'Due Date',
  final_comments: 'Final Comments',
}

const HEADER_HINTS: Record<FieldKey, string[]> = {
  title: ['task name', 'task', 'title', 'name', 'activity'],
  description: ['description', 'details', 'notes', 'note', 'comments', 'reference', 'link', 'url'],
  status: ['status'],
  priority: ['priority'],
  progress: ['progress', 'progress %', '%', 'completion'],
  start_date: ['start date', 'start', 'begin', 'kick off', 'kickoff'],
  due_date: ['due date', 'due', 'end date', 'end', 'deadline', 'target date'],
  final_comments: ['final comments', 'final comment', 'wrap up', 'wrap-up', 'closing comments', 'summary'],
}

function normaliseHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, ' ')
}

function autoMap(headers: string[]): Record<FieldKey, string | null> {
  const out: Record<FieldKey, string | null> = {
    title: null, description: null, status: null, priority: null, progress: null,
    start_date: null, due_date: null, final_comments: null,
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
  if (s === 'in progress' || s === 'in_progress' || s === 'in review' || s === 'review' || s === 'ongoing' || s === 'working' || s === 'wip' || s === 'active') return 'in_progress'
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

const TEMPLATE_CSV = `Title,Description,Status,Priority,Progress,Start Date,Due Date,Final Comments
Publish weekly blog,Long-form article on product release,In Progress,High,40,2026-06-01,2026-06-07,Draft sent to editor
On-page SEO audit,Audit top 20 landing pages and ship fixes,Pending,Medium,0,2026-06-03,2026-06-15,
Backlink outreach,Send 25 outreach mails to target sites,Pending,Medium,0,2026-06-05,2026-06-25,
Newsletter send,Compile + ship monthly newsletter,Completed,Low,100,2026-06-01,2026-06-02,Sent on schedule
Keyword refresh,Refresh keyword targets for next month,Pending,High,0,2026-06-20,2026-06-28,
`

function downloadBlob(filename: string, content: BlobPart, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function downloadCsvTemplate() {
  downloadBlob('monthly-tasks-template.csv', TEMPLATE_CSV, 'text/csv;charset=utf-8')
}

function downloadXlsxTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Title', 'Description', 'Status', 'Priority', 'Progress', 'Start Date', 'Due Date', 'Final Comments'],
    ['Publish weekly blog', 'Long-form article on product release', 'In Progress', 'High', 40, '2026-06-01', '2026-06-07', 'Draft sent to editor'],
    ['On-page SEO audit', 'Audit top 20 landing pages and ship fixes', 'Pending', 'Medium', 0, '2026-06-03', '2026-06-15', ''],
    ['Backlink outreach', 'Send 25 outreach mails to target sites', 'Pending', 'Medium', 0, '2026-06-05', '2026-06-25', ''],
    ['Newsletter send', 'Compile + ship monthly newsletter', 'Completed', 'Low', 100, '2026-06-01', '2026-06-02', 'Sent on schedule'],
    ['Keyword refresh', 'Refresh keyword targets for next month', 'Pending', 'High', 0, '2026-06-20', '2026-06-28', ''],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Monthly Tasks')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  downloadBlob('monthly-tasks-template.xlsx', buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}

export default function MonthlyBulkUploadModal({ user, year, month, section, onClose, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Row[]>([])
  const [mapping, setMapping] = useState<Record<FieldKey, string | null>>({
    title: null, description: null, status: null, priority: null, progress: null,
    start_date: null, due_date: null, final_comments: null,
  })
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showTemplate, setShowTemplate] = useState(false)
  const [imported, setImported] = useState(false)

  async function copyTemplate() {
    try {
      await navigator.clipboard.writeText(TEMPLATE_CSV)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setShowTemplate(true)
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setImported(false)
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
    } catch {
      setError('Could not parse file. Use .csv, .xlsx, or .xls')
    } finally {
      e.target.value = ''
    }
  }

  const mappedRows = useMemo<MappedRow[]>(() => {
    if (!mapping.title) return []
    return rawRows.map(row => {
      const title = String(row[mapping.title!] ?? '').trim()
      const description = mapping.description ? (String(row[mapping.description] ?? '').trim() || null) : null
      const status = mapping.status ? parseStatus(row[mapping.status]) : 'pending'
      const priority = mapping.priority ? parsePriority(row[mapping.priority]) : 'medium'
      const progress = mapping.progress ? parseProgress(row[mapping.progress]) : (status === 'completed' ? 100 : 0)
      const start_date = mapping.start_date ? parseDate(row[mapping.start_date]) : null
      const due_date = mapping.due_date ? parseDate(row[mapping.due_date]) : null
      const final_comments = mapping.final_comments ? (String(row[mapping.final_comments] ?? '').trim() || null) : null
      const err = !title ? 'Title is empty' : undefined
      return { title, description, status, priority, progress, start_date, due_date, final_comments, _error: err }
    })
  }, [rawRows, mapping])

  const importable = useMemo(() => mappedRows.filter(r => r.title), [mappedRows])
  const blockedCount = mappedRows.length - importable.length

  function handleImport() {
    if (importable.length === 0) return
    onImported(importable)
    setImported(true)
  }

  const sectionLabel = section === 'start' ? 'Start of the Month' : 'End of the Month'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-4xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Bulk Upload Monthly Tasks</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Importing under <strong>{user.full_name}</strong> ({sectionLabel} · {MONTHS[month - 1]} {year})
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
            <button
              type="button"
              onClick={downloadXlsxTemplate}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Download size={15} />
              Excel Template
            </button>
            <button
              type="button"
              onClick={downloadCsvTemplate}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <Download size={15} />
              CSV Template
            </button>
            <a
              href="https://docs.google.com/spreadsheets/d/1-7-SY76p2cgXyzHXs4UFkWopjxbsUZcxb5xOVkV8E4g/edit?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <ExternalLink size={15} />
              Open in Google Sheets
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
                Select all (Ctrl+A) → Copy (Ctrl+C) → paste into Notepad → Save As <code>monthly-tasks-template.csv</code> (set &quot;Save as type&quot; to &quot;All files&quot;).
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

          {imported && (
            <p className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 rounded-lg px-3 py-2">
              <Check size={14} className="mt-0.5 flex-shrink-0" />
              Imported {importable.length} task{importable.length === 1 ? '' : 's'}.
            </p>
          )}

          {headers.length > 0 && !imported && (
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

          {mappedRows.length > 0 && !imported && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                Preview ({importable.length} importable · {blockedCount} skipped)
              </h3>
              <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                    <tr className="text-left text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      <th className="px-2 py-1.5 font-medium">Title</th>
                      <th className="px-2 py-1.5 font-medium">Status</th>
                      <th className="px-2 py-1.5 font-medium">Priority</th>
                      <th className="px-2 py-1.5 font-medium">Progress</th>
                      <th className="px-2 py-1.5 font-medium">Start</th>
                      <th className="px-2 py-1.5 font-medium">Due</th>
                      <th className="px-2 py-1.5 font-medium">Final Comments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappedRows.slice(0, 50).map((r, i) => (
                      <tr key={i} className={`border-t border-gray-100 dark:border-gray-800 ${r._error ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
                        <td className="px-2 py-1.5 text-gray-900 dark:text-white">{r.title || <span className="text-red-500">missing</span>}</td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 capitalize whitespace-nowrap">{r.status.replace('_', ' ')}</td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 capitalize">{r.priority}</td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">{r.progress}%</td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.start_date ?? '—'}</td>
                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.due_date ?? '—'}</td>
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
            {imported ? 'Close' : 'Cancel'}
          </button>
          {!imported && (
            <button
              onClick={handleImport}
              disabled={importable.length === 0 || !mapping.title}
              className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload size={15} />
              Import {importable.length} task{importable.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
