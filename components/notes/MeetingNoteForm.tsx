'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Loader2 } from 'lucide-react'
import TimelineEditor from './TimelineEditor'
import RichTextEditor from './RichTextEditor'
import type { MeetingNote, MeetingNoteTimeline } from '@/types'

interface Props {
  note?: MeetingNote
}

const today = new Date().toISOString().slice(0, 10)

export default function MeetingNoteForm({ note }: Props) {
  const router = useRouter()
  const isEdit = !!note

  const [title,       setTitle]       = useState(note?.title        ?? '')
  const [meetingDate, setMeetingDate] = useState(note?.meeting_date  ?? today)
  const [metWith,     setMetWith]     = useState(note?.met_with      ?? '')
  const [goal,        setGoal]        = useState(note?.goal          ?? '')
  const [body,        setBody]        = useState(note?.body          ?? '')
  const [timelines,   setTimelines]   = useState<MeetingNoteTimeline[]>(note?.timelines ?? [])
  const [saving,      setSaving]      = useState(false)
  const [errors,      setErrors]      = useState<Record<string, string>>({})

  function validate() {
    const errs: Record<string, string> = {}
    if (!title.trim())  errs.title        = 'Title is required'
    if (!meetingDate)   errs.meeting_date  = 'Meeting date is required'
    if (!goal.trim())   errs.goal          = 'Goal is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)

    const payload = {
      title:        title.trim(),
      meeting_date: meetingDate,
      met_with:     metWith.trim() || null,
      goal:         goal.trim(),
      body:         body.replace(/<[^>]+>/g, '').trim() ? body : null,
      timelines:    timelines.filter(t => t.label.trim()),
    }

    const url    = isEdit ? `/api/notes/${note!.id}` : '/api/notes'
    const method = isEdit ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    setSaving(false)
    if (res.ok) {
      const data = await res.json()
      router.push(`/notes/${data.id}`)
      router.refresh()
    } else {
      const data = await res.json()
      setErrors({ form: data.error ?? 'Something went wrong' })
    }
  }

  function inputCls(field: string) {
    return `w-full border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
      errors[field] ? 'border-red-400' : 'border-gray-200'
    }`
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <Link href="/notes" className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 w-fit mb-3">
          <ChevronLeft size={14} />
          Back to Notes
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? 'Edit Meeting Note' : 'New Meeting Note'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">

        {errors.form && (
          <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errors.form}</p>
        )}

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Q3 Campaign Planning with Deepa"
            className={inputCls('title')}
          />
          {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
        </div>

        {/* Meeting Date + Met With */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Meeting Date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={meetingDate}
              onChange={e => setMeetingDate(e.target.value)}
              className={inputCls('meeting_date')}
            />
            {errors.meeting_date && <p className="text-xs text-red-500 mt-1">{errors.meeting_date}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Met With</label>
            <input
              type="text"
              value={metWith}
              onChange={e => setMetWith(e.target.value)}
              placeholder="e.g. Deepa"
              className={inputCls('met_with')}
            />
          </div>
        </div>

        {/* Goal */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Goal / Objective <span className="text-red-400">*</span>
          </label>
          <textarea
            rows={3}
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="What is this initiative aiming to achieve?"
            className={inputCls('goal')}
          />
          {errors.goal
            ? <p className="text-xs text-red-500 mt-1">{errors.goal}</p>
            : <p className="text-xs text-gray-400 mt-1">Describe the outcome discussed in this meeting</p>
          }
        </div>

        {/* Notes — rich text */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
          <RichTextEditor
            value={body}
            onChange={setBody}
            placeholder="Context, decisions, action items, anything said…"
          />
          <p className="text-xs text-gray-400 mt-1">Optional — supports bold, lists, headings, quotes</p>
        </div>

        {/* Timelines */}
        <TimelineEditor timelines={timelines} onChange={setTimelines} />

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <Link
            href="/notes"
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Saving…' : 'Save Note'}
          </button>
        </div>
      </form>
    </div>
  )
}
