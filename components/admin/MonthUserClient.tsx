'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Upload, FileText, X } from 'lucide-react'

const ACCEPTED_FILE_TYPES = '.html,.htm,.doc,.docx,.csv,.xls,.xlsx'
const ACCEPTED_EXT = new Set(['html', 'htm', 'doc', 'docx', 'csv', 'xls', 'xlsx'])

function hasAcceptedExtension(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ACCEPTED_EXT.has(ext)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface UserInfo {
  id: string
  full_name: string
  avatar_url?: string | null
}

interface Props {
  year: number
  month: number
  user: UserInfo
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function Avatar({ user }: { user: UserInfo }) {
  if (user.avatar_url) {
    return <img src={user.avatar_url} alt={user.full_name} className="w-10 h-10 rounded-full object-cover" />
  }
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-bold flex items-center justify-center">
      {initials(user.full_name)}
    </div>
  )
}

export default function MonthUserClient({ year, month, user }: Props) {
  const monthHref = `/admin/monthly-tasks/${year}/${String(month).padStart(2, '0')}`
  const [startFile, setStartFile] = useState<File | null>(null)
  const [endFile, setEndFile] = useState<File | null>(null)
  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      <div className="flex-shrink-0">
        <Link
          href={monthHref}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 mb-3"
        >
          <ArrowLeft size={14} />
          {MONTHS[month - 1]} {year}
        </Link>
        <div className="flex items-center gap-3 mb-4">
          <Avatar user={user} />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{user.full_name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Monthly plan — {MONTHS[month - 1]} {year}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        <UploadPanel
          title="Start of the Month"
          headerColor="blue"
          file={startFile}
          onFile={setStartFile}
        />
        <UploadPanel
          title="End of the Month"
          headerColor="purple"
          file={endFile}
          onFile={setEndFile}
        />
      </div>
    </div>
  )
}

function UploadPanel({
  title, headerColor, file, onFile,
}: {
  title: string
  headerColor: 'blue' | 'purple'
  file: File | null
  onFile: (f: File | null) => void
}) {
  const inputId = useId()
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const headerCls = headerColor === 'blue'
    ? 'bg-blue-50/40 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300'
    : 'bg-purple-50/40 dark:bg-purple-950/20 text-purple-700 dark:text-purple-300'
  const buttonCls = headerColor === 'blue'
    ? 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-900/60 border-blue-200 dark:border-blue-900'
    : 'text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 hover:bg-purple-200 dark:hover:bg-purple-900/60 border-purple-200 dark:border-purple-900'

  function acceptFile(f: File | null | undefined) {
    if (!f) return
    if (!hasAcceptedExtension(f.name)) {
      setError(`"${f.name}" isn't an accepted file type. Use HTML, DOC/DOCX, CSV, or XLSX.`)
      return
    }
    setError(null)
    onFile(f)
  }

  function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    acceptFile(e.target.files?.[0])
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    acceptFile(e.dataTransfer.files?.[0])
  }

  return (
    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl flex flex-col overflow-hidden">
      <header className={`flex items-center justify-between gap-2 px-5 py-3 border-b border-gray-100 dark:border-gray-800 ${headerCls}`}>
        <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
        <label
          htmlFor={inputId}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded-lg cursor-pointer transition-colors ${buttonCls}`}
        >
          <Upload size={12} />
          {file ? 'Replace' : 'Upload'}
        </label>
        <input
          id={inputId}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          onChange={onSelect}
          className="sr-only"
        />
      </header>
      <div
        className={`flex-1 overflow-y-auto p-5 transition-colors ${dragOver ? 'bg-blue-50/60 dark:bg-blue-950/30' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {file ? (
          <div className="flex items-start justify-between gap-3 p-3 border border-gray-200 dark:border-gray-800 rounded-lg">
            <div className="flex items-start gap-2.5 min-w-0">
              <FileText size={18} className="text-gray-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{file.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatBytes(file.size)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onFile(null)}
              className="p-1 text-gray-400 hover:text-red-600"
              title="Remove file"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <label
            htmlFor={inputId}
            className="w-full h-full min-h-[160px] border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-700 dark:hover:text-blue-400 transition-colors cursor-pointer"
          >
            <Upload size={20} />
            <span className="text-xs">Click or drag a file here</span>
          </label>
        )}
        {error && (
          <p className="mt-3 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>
    </section>
  )
}
