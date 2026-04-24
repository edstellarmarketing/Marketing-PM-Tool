import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { Profile } from '@/types'

export async function getAuthUser(): Promise<{ user: { id: string } | null; error: NextResponse | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { user, error: null }
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
  return data
}

export async function requireAdmin(): Promise<{ profile: Profile | null; error: NextResponse | null }> {
  const { user, error } = await getAuthUser()
  if (error || !user) return { profile: null, error: error! }

  const profile = await getProfile(user.id)
  if (!profile || profile.role !== 'admin') {
    return { profile: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { profile, error: null }
}
