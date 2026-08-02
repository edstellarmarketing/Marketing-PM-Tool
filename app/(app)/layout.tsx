import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasModuleAccess } from '@/lib/api'
import type { Role } from '@/types'
import Sidebar from '@/components/shared/Sidebar'
import NotificationsPanel from '@/components/shared/NotificationsPanel'
import GlobalSearch from '@/components/shared/GlobalSearch'
import DarkModeToggle from '@/components/shared/DarkModeToggle'
import KeyboardShortcuts from '@/components/shared/KeyboardShortcuts'
import AssignTaskButton from '@/components/admin/AssignTaskButton'
import CreateMonthlyTasksButton from '@/components/admin/CreateMonthlyTasksButton'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, department, designation, avatar_url')
    .eq('id', user.id)
    .single()

  const fullName = profile?.full_name ?? user.email ?? 'User'
  const role = (profile?.role ?? 'member') as Role
  const department = profile?.department ?? null
  const designation = profile?.designation ?? null
  const avatarUrl = profile?.avatar_url ?? null
  const isManager = role === 'admin' || role === 'team_lead'

  // Hidden modules are not part of the Role matrix, so the sidebar cannot infer
  // them — it has to be told. Only grant holders get the entry, which is what
  // keeps the module invisible to everyone else.
  const hasExpenses = await hasModuleAccess(user.id, 'expenses')

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar
        role={role}
        department={department}
        fullName={fullName}
        designation={designation}
        avatarUrl={avatarUrl}
        hasExpenses={hasExpenses}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 md:px-6 gap-4 pl-14 md:pl-6">
          <div className="flex items-center gap-3">
            <GlobalSearch />
            {isManager && <AssignTaskButton />}
            {isManager && <CreateMonthlyTasksButton />}
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
