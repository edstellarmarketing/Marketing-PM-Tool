import Link from 'next/link'
import { Calendar, User } from 'lucide-react'
import type { MeetingNote } from '@/types'

interface Props {
  note: MeetingNote
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function MeetingNoteCard({ note }: Props) {
  const timelineCount = note.timelines?.length ?? 0

  return (
    <Link href={`/notes/${note.id}`} className="block group">
      <div className="flex overflow-hidden bg-white border border-gray-200 rounded-xl hover:border-indigo-200 hover:shadow-sm transition-all duration-150">
        {/* Left accent bar */}
        <div className="w-1 bg-indigo-400 flex-shrink-0" />

        {/* Content */}
        <div className="flex-1 px-4 py-3.5 min-w-0">
          {/* Title + date */}
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors leading-tight">
              {note.title}
            </p>
            <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">
              {fmtDate(note.meeting_date)}
            </span>
          </div>

          {/* Goal */}
          <p className="text-xs text-gray-500 mt-1 line-clamp-1">{note.goal}</p>

          {/* Footer pills */}
          {(note.met_with || timelineCount > 0) && (
            <div className="flex items-center gap-3 mt-2">
              {note.met_with && (
                <span className="flex items-center gap-1 text-[11px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  <User size={10} />
                  {note.met_with}
                </span>
              )}
              {timelineCount > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-gray-400">
                  <Calendar size={10} />
                  {timelineCount} timeline{timelineCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
