'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Upload, Trash2 } from 'lucide-react'
import MonthlyBulkUploadModal, { type MappedRow } from './MonthlyBulkUploadModal'

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

type Section = 'start' | 'end'

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

function storageKey(userId: string, year: number, month: number, section: Section) {
  return `monthly-tasks-rows::${userId}::${year}-${String(month).padStart(2, '0')}::${section}`
}

export default function MonthUserClient({ year, month, user }: Props) {
  const monthHref = `/admin/monthly-tasks/${year}/${String(month).padStart(2, '0')}`
  const [startRows, setStartRows] = useState<MappedRow[]>([])
  const [endRows, setEndRows] = useState<MappedRow[]>([])
  const [openModal, setOpenModal] = useState<Section | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const s = localStorage.getItem(storageKey(user.id, year, month, 'start'))
      const e = localStorage.getItem(storageKey(user.id, year, month, 'end'))
      if (s) setStartRows(JSON.parse(s))
      if (e) setEndRows(JSON.parse(e))
    } catch {}
    setHydrated(true)
  }, [user.id, year, month])

  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(storageKey(user.id, year, month, 'start'), JSON.stringify(startRows)) } catch {}
  }, [startRows, hydrated, user.id, year, month])

  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(storageKey(user.id, year, month, 'end'), JSON.stringify(endRows)) } catch {}
  }, [endRows, hydrated, user.id, year, month])

  function handleImported(section: Section, rows: MappedRow[]) {
    if (section === 'start') setStartRows(prev => [...prev, ...rows])
    else setEndRows(prev => [...prev, ...rows])
  }

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
        <TaskPanel
          title="Start of the Month"
          headerColor="blue"
          rows={startRows}
          onUploadClick={() => setOpenModal('start')}
          onClear={() => setStartRows([])}
          onRemoveRow={i => setStartRows(prev => prev.filter((_, idx) => idx !== i))}
        />
        <TaskPanel
          title="End of the Month"
          headerColor="purple"
          rows={endRows}
          onUploadClick={() => setOpenModal('end')}
          onClear={() => setEndRows([])}
          onRemoveRow={i => setEndRows(prev => prev.filter((_, idx) => idx !== i))}
        />
      </div>

      {openModal && (
        <MonthlyBulkUploadModal
          user={user}
          year={year}
          month={month}
          section={openModal}
          onClose={() => setOpenModal(null)}
          onImported={rows => handleImported(openModal, rows)}
        />
      )}
    </div>
  )
}

function TaskPanel({
  title, headerColor, rows, onUploadClick, onClear, onRemoveRow,
}: {
  title: string
  headerColor: 'blue' | 'purple'
  rows: MappedRow[]
  onUploadClick: () => void
  onClear: () => void
  onRemoveRow: (index: number) => void
}) {
  const headerCls = headerColor === 'blue'
    ? 'bg-blue-50/40 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300'
    : 'bg-purple-50/40 dark:bg-purple-950/20 text-purple-700 dark:text-purple-300'
  const buttonCls = headerColor === 'blue'
    ? 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-900/60 border-blue-200 dark:border-blue-900'
    : 'text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 hover:bg-purple-200 dark:hover:bg-purple-900/60 border-purple-200 dark:border-purple-900'

  return (
    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl flex flex-col overflow-hidden">
      <header className={`flex items-center justify-between gap-2 px-5 py-3 border-b border-gray-100 dark:border-gray-800 ${headerCls}`}>
        <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <Trash2 size={12} />
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onUploadClick}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded-lg cursor-pointer transition-colors ${buttonCls}`}
          >
            <Upload size={12} />
            Bulk Upload
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {rows.length === 0 ? (
          <button
            type="button"
            onClick={onUploadClick}
            className="w-full h-full min-h-[160px] border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-700 dark:hover:text-blue-400 transition-colors"
          >
            <Upload size={20} />
            <span className="text-xs">Bulk upload from CSV or Excel</span>
          </button>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800/40">
                <tr className="text-left text-gray-500 dark:text-gray-400">
                  <th className="px-2 py-1.5 font-medium">Title</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                  <th className="px-2 py-1.5 font-medium">Priority</th>
                  <th className="px-2 py-1.5 font-medium">Progress</th>
                  <th className="px-2 py-1.5 font-medium whitespace-nowrap">Due</th>
                  <th className="px-2 py-1.5 font-medium w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-2 py-1.5 text-gray-900 dark:text-white">
                      <p className="font-medium">{r.title}</p>
                      {r.description && (
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{r.description}</p>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 capitalize whitespace-nowrap">{r.status.replace('_', ' ')}</td>
                    <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 capitalize">{r.priority}</td>
                    <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">{r.progress}%</td>
                    <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.due_date ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => onRemoveRow(i)}
                        className="p-1 text-gray-400 hover:text-red-600"
                        title="Remove row"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
