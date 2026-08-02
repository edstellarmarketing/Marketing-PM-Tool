'use client'

import { useRef, useState } from 'react'
import { AlertCircle, ArrowRight, Check, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RowChange { column: string; label: string; from: unknown; to: string | number | null }
interface RowResult {
  row: number
  ref: string
  status: 'update' | 'unchanged' | 'error'
  changes: RowChange[]
  errors: string[]
}
interface Preview {
  usedColumns: string[]
  ignoredColumns: string[]
  unknownColumns: string[]
  totalRows: number
  updates: number
  unchanged: number
  errors: number
  rows: RowResult[]
  applied?: number
  failed?: number
  failures?: { ref: string; message: string }[]
}

const cell = (v: unknown) => {
  if (v === null || v === undefined || v === '') return '(blank)'
  const s = String(v)
  return s.length > 48 ? s.slice(0, 45) + '…' : s
}

export default function ImportDialog({ onClose, onApplied }: {
  onClose: () => void
  onApplied: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [done, setDone] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function send(mode: 'preview' | 'apply') {
    if (!file) return
    setBusy(true); setError(null)
    try {
      const body = new FormData()
      body.set('file', file)
      body.set('mode', mode)
      const res = await fetch('/api/expenses/import', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Import failed')
        // A rejected apply still carries the per-row detail worth showing.
        if (data.rows) setPreview(data)
        return
      }
      if (mode === 'preview') setPreview(data)
      else { setDone(data); onApplied() }
    } catch {
      setError('Connection error during import')
    } finally {
      setBusy(false)
    }
  }

  function pick(f: File | null) {
    setFile(f); setPreview(null); setDone(null); setError(null)
  }

  const problems = preview?.rows.filter(r => r.status === 'error') ?? []
  const updates = preview?.rows.filter(r => r.status === 'update') ?? []

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-4xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Upload size={18} className="text-blue-500" />
            Bulk update from a spreadsheet
          </h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {done ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/40 mb-3">
                <Check size={24} className="text-green-600 dark:text-green-400" />
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {done.applied} {done.applied === 1 ? 'entry' : 'entries'} updated
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {done.unchanged > 0 && `${done.unchanged} already matched. `}
                {done.failed ? `${done.failed} failed to write.` : 'Nothing else was touched.'}
              </p>
              {!!done.failures?.length && (
                <ul className="mt-3 text-left text-xs text-red-600 dark:text-red-400 max-w-md mx-auto space-y-0.5">
                  {done.failures.map(f => <li key={f.ref}>{f.ref}: {f.message}</li>)}
                </ul>
              )}
              <button onClick={onClose} className="mt-5 px-4 py-2 bg-gray-900 dark:bg-blue-600 text-white text-sm font-semibold rounded-lg">
                Done
              </button>
            </div>
          ) : (
            <>
              {/* The contract, stated where the decision is made. */}
              <div className="text-xs text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 rounded-lg p-3 space-y-1">
                <p><strong>Export the ledger first</strong> — that sheet is the template, and its <strong>Ref</strong> column is how rows are matched.</p>
                <p>Only the columns you include are touched. A column you leave out is left alone; a cell you <strong>blank out is cleared</strong>.</p>
                <p>This updates existing entries only. It never creates or deletes one, and rows in the recycle bin are rejected.</p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  ref={inputRef} type="file" accept=".csv,.xlsx,.xls"
                  onChange={e => pick(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <button
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-200"
                >
                  <FileSpreadsheet size={15} />
                  {file ? 'Choose a different file' : 'Choose a CSV or Excel file'}
                </button>
                {file && (
                  <span className="text-sm text-gray-500 truncate">
                    {file.name} · {(file.size / 1024).toFixed(0)} KB
                  </span>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg text-red-600 dark:text-red-400 text-sm">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {file && !preview && (
                <button
                  onClick={() => send('preview')} disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-blue-600 hover:bg-gray-800 dark:hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
                  Check the file
                </button>
              )}

              {preview && (
                <>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'Rows in file', value: preview.totalRows, cls: 'text-gray-900 dark:text-white' },
                      { label: 'Will change', value: preview.updates, cls: 'text-blue-600 dark:text-blue-400' },
                      { label: 'Already match', value: preview.unchanged, cls: 'text-gray-500' },
                      { label: 'Problems', value: preview.errors, cls: preview.errors ? 'text-red-600 dark:text-red-400' : 'text-gray-500' },
                    ].map(k => (
                      <div key={k.label} className="border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2">
                        <p className="text-xs text-gray-500">{k.label}</p>
                        <p className={cn('text-xl font-semibold tabular-nums', k.cls)}>{k.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="text-xs text-gray-500 space-y-0.5">
                    <p><span className="text-gray-400">Columns being applied:</span> {preview.usedColumns.join(', ') || 'none'}</p>
                    {preview.ignoredColumns.length > 0 && (
                      <p><span className="text-gray-400">Skipped (calculated or read-only):</span> {preview.ignoredColumns.join(', ')}</p>
                    )}
                    {preview.unknownColumns.length > 0 && (
                      <p className="text-amber-600 dark:text-amber-400">
                        Not recognised, so ignored: {preview.unknownColumns.join(', ')}
                      </p>
                    )}
                  </div>

                  {problems.length > 0 && (
                    <div className="border border-red-100 dark:border-red-900 rounded-lg overflow-hidden">
                      <p className="px-3 py-2 bg-red-50 dark:bg-red-950/40 text-xs font-semibold text-red-700 dark:text-red-400">
                        {problems.length} {problems.length === 1 ? 'row' : 'rows'} must be fixed before anything can be applied
                      </p>
                      <ul className="divide-y divide-red-50 dark:divide-red-900/40 max-h-48 overflow-y-auto">
                        {problems.slice(0, 50).map(r => (
                          <li key={r.row} className="px-3 py-1.5 text-xs">
                            <span className="font-mono text-gray-500">row {r.row}</span>
                            {r.ref && <span className="font-mono text-gray-700 dark:text-gray-300"> · {r.ref}</span>}
                            <span className="text-red-600 dark:text-red-400"> — {r.errors.join('; ')}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {updates.length > 0 && (
                    <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
                      <p className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-xs font-semibold text-gray-600 dark:text-gray-300">
                        Exactly what will change
                      </p>
                      <div className="max-h-72 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
                        {updates.slice(0, 100).map(r => (
                          <div key={r.row} className="px-3 py-2">
                            <p className="font-mono text-xs text-gray-500">{r.ref}</p>
                            <ul className="mt-0.5 space-y-0.5">
                              {r.changes.map(c => (
                                <li key={c.column} className="text-xs flex flex-wrap items-baseline gap-1.5">
                                  <span className="text-gray-500">{c.label}:</span>
                                  <span className="text-red-600 dark:text-red-400 line-through">{cell(c.from)}</span>
                                  <ArrowRight size={10} className="text-gray-400" />
                                  <span className="text-green-700 dark:text-green-400 font-medium">{cell(c.to)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                        {updates.length > 100 && (
                          <p className="px-3 py-2 text-xs text-gray-400">
                            …and {updates.length - 100} more rows. All of them will be applied.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => send('apply')}
                      disabled={busy || preview.errors > 0 || preview.updates === 0}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-blue-600 hover:bg-gray-800 dark:hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                      title={preview.errors > 0 ? 'Fix the problem rows first' : undefined}
                    >
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                      Apply {preview.updates} {preview.updates === 1 ? 'change' : 'changes'}
                    </button>
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
