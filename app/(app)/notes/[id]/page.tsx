import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Pencil, Target, FileText, CalendarDays, SquarePen, User, Calendar } from 'lucide-react'
import DeleteNoteButton from '@/components/notes/DeleteNoteButton'
import RichTextView from '@/components/notes/RichTextView'
import type { MeetingNote } from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

function fmtLong(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtShort(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function isPlainText(body: string) {
  return !/<[a-z][\s\S]*>/i.test(body)
}

export default async function NoteDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: note, error } = await supabase
    .from('meeting_notes')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !note) notFound()
  const n = note as MeetingNote
  const today = new Date().toISOString().slice(0, 10)

  const overdueCount  = n.timelines?.filter(t => t.date && t.date < today).length ?? 0
  const upcomingCount = n.timelines?.filter(t => t.date && t.date >= today).length ?? 0

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Top navigation bar */}
      <div className="flex items-center justify-between">
        <Link href="/notes" className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors">
          <ChevronLeft size={14} />
          Back to Notes
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/tasks/new?from_note=${n.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <SquarePen size={13} />
            Convert to Task
          </Link>
          <Link
            href={`/notes/${n.id}/edit`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            <Pencil size={13} />
            Edit
          </Link>
          <DeleteNoteButton id={n.id} />
        </div>
      </div>

      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {/* Indigo top stripe */}
        <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-indigo-400" />

        <div className="px-6 py-5">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">{n.title}</h1>

          {/* Meta pills row */}
          <div className="flex items-center flex-wrap gap-2 mt-3">
            <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
              <Calendar size={11} />
              {fmtLong(n.meeting_date)}
            </span>
            {n.met_with && (
              <span className="flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full font-medium">
                <User size={11} />
                {n.met_with}
              </span>
            )}
            {n.timelines?.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                <CalendarDays size={11} />
                {n.timelines.length} milestone{n.timelines.length !== 1 ? 's' : ''}
                {overdueCount > 0 && (
                  <span className="ml-1 text-red-500 font-semibold">· {overdueCount} overdue</span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Goal */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <Target size={13} className="text-indigo-600" />
          </div>
          <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Goal / Objective</p>
        </div>
        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-medium">{n.goal}</p>
      </div>

      {/* Notes (rich text) */}
      {n.body && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <FileText size={13} className="text-gray-500" />
            </div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Notes</p>
          </div>
          {isPlainText(n.body) ? (
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{n.body}</p>
          ) : (
            <RichTextView html={n.body} />
          )}
        </div>
      )}

      {/* Timelines */}
      {n.timelines?.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <CalendarDays size={13} className="text-gray-500" />
              </div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Timelines</p>
            </div>
            {/* Summary chips */}
            <div className="flex items-center gap-2">
              {overdueCount > 0 && (
                <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                  {overdueCount} overdue
                </span>
              )}
              {upcomingCount > 0 && (
                <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  {upcomingCount} upcoming
                </span>
              )}
            </div>
          </div>

          {/* Vertical timeline */}
          <div className="relative pl-6">
            {/* Connecting vertical line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />

            <div className="space-y-4">
              {n.timelines.map((t, i) => {
                const isOverdue  = !!t.date && t.date < today
                const isToday    = t.date === today
                const isUpcoming = !!t.date && t.date > today
                const noDate     = !t.date

                const dotColor = isOverdue  ? 'bg-red-400 ring-red-100'
                              : isToday    ? 'bg-amber-400 ring-amber-100'
                              : isUpcoming ? 'bg-indigo-400 ring-indigo-100'
                              :              'bg-gray-300 ring-gray-100'

                const dateCls = isOverdue ? 'text-red-500 font-semibold'
                              : isToday   ? 'text-amber-600 font-semibold'
                              :             'text-gray-400'

                return (
                  <div key={i} className="relative flex items-start gap-4">
                    {/* Node */}
                    <div className={`absolute -left-6 mt-0.5 w-3.5 h-3.5 rounded-full ring-2 flex-shrink-0 ${dotColor}`} />

                    {/* Content */}
                    <div className="flex-1 flex items-start justify-between gap-4 bg-gray-50 rounded-xl px-4 py-3 hover:bg-indigo-50/40 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 leading-snug">{t.label}</p>
                        {isOverdue && (
                          <p className="text-xs text-red-400 mt-0.5">Past due</p>
                        )}
                        {isToday && (
                          <p className="text-xs text-amber-500 mt-0.5">Due today</p>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        {t.date ? (
                          <span className={`text-xs ${dateCls}`}>
                            {fmtShort(t.date)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300 italic">No date</span>
                        )}
                        <div className="mt-0.5">
                          {isOverdue  && <span className="text-[10px] font-bold text-red-400 bg-red-50 px-1.5 py-0.5 rounded-full">Overdue</span>}
                          {isToday    && <span className="text-[10px] font-bold text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded-full">Today</span>}
                          {isUpcoming && <span className="text-[10px] font-medium text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full">Upcoming</span>}
                          {noDate     && <span className="text-[10px] text-gray-300 bg-gray-50 px-1.5 py-0.5 rounded-full">TBD</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
