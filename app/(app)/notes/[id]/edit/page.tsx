import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import MeetingNoteForm from '@/components/notes/MeetingNoteForm'
import type { MeetingNote } from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditNotePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'admin') redirect('/dashboard')

  const { data: note, error } = await supabase
    .from('meeting_notes')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !note) notFound()
  return <MeetingNoteForm note={note as MeetingNote} />
}
