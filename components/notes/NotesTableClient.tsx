'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink, Pencil, Trash2, SquarePen, Calendar, NotebookPen } from 'lucide-react'
import Paginator from '@/components/ui/Paginator'
import type { MeetingNote } from '@/types'

const PAGE_SIZES = [10, 25, 50]

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

interface Props {
  initialNotes: MeetingNote[]
}

export default function NotesTableClient({ initialNotes }: Props) {
  const router = useRouter()
  const [notes, setNotes]     = useState(initialNotes)
  const [page, setPage]       = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [deleting, setDeleting] = useState<string | null>(null)

  const totalPages = Math.max(1, Math.ceil(notes.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = notes.slice((safePage - 1) * pageSize, safePage * pageSize)

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    setDeleting(id)
    const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    setDeleting(null)
    if (res.ok) {
      setNotes(prev => prev.filter(n => n.id !== id))
      router.refresh()
    }
  }

  if (notes.length === 0) {
    return (
      <div className="text-center py-16 bg-white border border-gray-200 rounded-xl">
        <NotebookPen size={40} className="text-indigo-200 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">No meeting notes yet</p>
        <p className="text-sm text-gray-400 mt-1">Capture your next manager conversation here</p>
        <Link
          href="/notes/new"
          className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <NotebookPen size={16} />
          Add Your First Note
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left py-3 px-4 font-medium">Title</th>
              <th className="text-left py-3 px-4 font-medium whitespace-nowrap">Meeting Date</th>
              <th className="text-left py-3 px-4 font-medium whitespace-nowrap">Met With</th>
              <th className="text-left py-3 px-4 font-medium">Goal</th>
              <th className="text-left py-3 px-4 font-medium">Timelines</th>
              <th className="py-3 px-4 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginated.map(note => {
              const timelineCount = note.timelines?.length ?? 0
              return (
                <tr key={note.id} className="hover:bg-gray-50 transition-colors">
                  {/* Title */}
                  <td className="py-3 px-4 max-w-[200px]">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-8 bg-indigo-400 rounded-full flex-shrink-0" />
                      <Link
                        href={`/notes/${note.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-indigo-700 line-clamp-2 leading-tight transition-colors"
                      >
                        {note.title}
                      </Link>
                    </div>
                  </td>

                  {/* Meeting Date */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="text-sm text-gray-600">{fmtDate(note.meeting_date)}</span>
                  </td>

                  {/* Met With */}
                  <td className="py-3 px-4">
                    {note.met_with ? (
                      <span className="flex items-center gap-1 text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full w-fit whitespace-nowrap">
                        {note.met_with}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-sm">—</span>
                    )}
                  </td>

                  {/* Goal */}
                  <td className="py-3 px-4 max-w-[260px]">
                    <p className="text-sm text-gray-500 line-clamp-2 leading-tight">{note.goal}</p>
                  </td>

                  {/* Timelines */}
                  <td className="py-3 px-4">
                    {timelineCount > 0 ? (
                      <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full w-fit whitespace-nowrap">
                        <Calendar size={10} />
                        {timelineCount}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-sm">—</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1 justify-end">
                      <Link
                        href={`/tasks/new?from_note=${note.id}`}
                        title="Convert to task"
                        className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        <SquarePen size={13} />
                      </Link>
                      <Link
                        href={`/notes/${note.id}`}
                        title="View note"
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <ExternalLink size={13} />
                      </Link>
                      <Link
                        href={`/notes/${note.id}/edit`}
                        title="Edit note"
                        className="p-1.5 rounded hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors"
                      >
                        <Pencil size={13} />
                      </Link>
                      <button
                        onClick={() => handleDelete(note.id, note.title)}
                        disabled={deleting === note.id}
                        title="Delete note"
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-4 pb-3">
        <Paginator
          total={notes.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={s => { setPageSize(s); setPage(1) }}
          pageSizeOptions={PAGE_SIZES}
        />
      </div>
    </div>
  )
}
