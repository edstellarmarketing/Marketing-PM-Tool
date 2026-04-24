import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ProfileForm from './ProfileForm'
import type { Profile } from '@/types'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const p = profile as Profile

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Update your photo and personal information</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <ProfileForm profile={p} />
      </div>

      {/* Read-only info */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Account Details</h2>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Email</span>
          <span className="text-gray-900">{user.email}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Role</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
            {p.role}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Member since</span>
          <span className="text-gray-900">{new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>
    </div>
  )
}
