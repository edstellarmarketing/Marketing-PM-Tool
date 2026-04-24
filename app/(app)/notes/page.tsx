import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { NotebookPen } from 'lucide-react'
import NotesTableClient from '@/components/notes/NotesTableClient'
import type { MeetingNote } from '@/types'

export default async function NotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'admin') redirect('/dashboard')

  const { data: notes } = await supabase
    .from('meeting_notes')
    .select('*')
    .eq('user_id', user.id)
    .order('meeting_date', { ascending: false })

  const allNotes = (notes ?? []) as MeetingNote[]

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meeting Notes</h1>
          <p className="text-sm text-gray-400 mt-0.5">Capture manager conversations &amp; future plans</p>
        </div>
        <Link
          href="/notes/new"
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <NotebookPen size={16} />
          New Note
        </Link>
      </div>

      <NotesTableClient initialNotes={allNotes} />
    </div>
  )
}
