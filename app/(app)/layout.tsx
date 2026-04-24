import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/shared/Sidebar'
import NotificationsPanel from '@/components/shared/NotificationsPanel'
import GlobalSearch from '@/components/shared/GlobalSearch'
import DarkModeToggle from '@/components/shared/DarkModeToggle'
import KeyboardShortcuts from '@/components/shared/KeyboardShortcuts'
import AssignTaskButton from '@/components/admin/AssignTaskButton'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, designation, avatar_url')
    .eq('id', user.id)
    .single()

  const fullName = profile?.full_name ?? user.email ?? 'User'
  const role = (profile?.role ?? 'member') as 'admin' | 'member'
  const designation = profile?.designation ?? null
  const avatarUrl = profile?.avatar_url ?? null

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar role={role} fullName={fullName} designation={designation} avatarUrl={avatarUrl} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 md:px-6 gap-4 pl-14 md:pl-6">
          <div className="flex items-center gap-3">
            <GlobalSearch />
            {role === 'admin' && <AssignTaskButton />}
          </div>
          <div className="flex items-center gap-1">
            <DarkModeToggle />
            <NotificationsPanel />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          {children}
        </main>
      </div>

      <KeyboardShortcuts />
    </div>
  )
}
