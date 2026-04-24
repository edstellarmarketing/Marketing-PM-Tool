'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CheckSquare, Trophy, Users, FileText, Award, LogOut, Menu, X, UserCircle, Settings, ClipboardCheck, NotebookPen, CalendarCheck, Mail, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  adminOnly?: boolean
  memberOnly?: boolean
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { href: '/admin/all-tasks', label: 'All Tasks', icon: <ListChecks size={18} />, adminOnly: true },
  { href: '/tasks', label: 'My Tasks', icon: <CheckSquare size={18} />, memberOnly: true },
  { href: '/notes', label: 'Meeting Notes', icon: <NotebookPen size={18} />, memberOnly: true },
  { href: '/attendance', label: 'Attendance', icon: <CalendarCheck size={18} />, memberOnly: true },
  { href: '/leaderboard', label: 'Leaderboard', icon: <Trophy size={18} /> },
  { href: '/performance', label: 'My Performance', icon: <Award size={18} />, memberOnly: true },
  { href: '/profile', label: 'My Profile', icon: <UserCircle size={18} /> },
  { href: '/admin', label: 'Admin', icon: <Users size={18} />, adminOnly: true },
  { href: '/admin/pending-approvals', label: 'Pending Approvals', icon: <ClipboardCheck size={18} /> },
  { href: '/admin/attendance', label: 'Attendance', icon: <CalendarCheck size={18} />, adminOnly: true },
  { href: '/admin/appraisals', label: 'Appraisals', icon: <FileText size={18} />, adminOnly: true },
  { href: '/admin/settings', label: 'Point Settings', icon: <Settings size={18} />, adminOnly: true },
  { href: '/admin/email-settings', label: 'Email Settings', icon: <Mail size={18} />, adminOnly: true },
]

interface SidebarProps {
  role: 'admin' | 'member'
  fullName: string
  designation?: string | null
  avatarUrl?: string | null
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function Sidebar({ role, fullName, designation, avatarUrl }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const visible = navItems.filter(item =>
    (!item.adminOnly || role === 'admin') &&
    (!item.memberOnly || role !== 'admin')
  )

  const SidebarContent = () => (
    <>
      <div className="px-4 py-4 border-b border-gray-800">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Marketing PM</p>
        <Link href="/profile" className="flex items-center gap-3 group">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName}
              className="w-9 h-9 rounded-full object-cover flex-shrink-0 ring-2 ring-gray-700 group-hover:ring-blue-500 transition-all"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ring-2 ring-gray-700 group-hover:ring-blue-500 transition-all">
              {initials(fullName)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-white group-hover:text-blue-400 transition-colors">{fullName}</p>
            {designation && <p className="text-xs text-gray-400 truncate">{designation}</p>}
          </div>
        </Link>
        <span className={cn(
          'text-xs px-2 py-0.5 rounded-full mt-2 inline-block',
          role === 'admin' ? 'bg-purple-600 text-white' : 'bg-blue-600 text-white'
        )}>
          {role}
        </span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visible.map(item => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href + '/'))
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-800 hover:text-white'
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-800">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white w-full transition-colors"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile toggle button */}
      <button
        className="md:hidden fixed top-3 left-3 z-50 p-2 bg-gray-900 text-white rounded-lg shadow-lg"
        onClick={() => setMobileOpen(o => !o)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside className={cn(
        'md:hidden fixed top-0 left-0 h-full w-60 bg-gray-900 text-white flex flex-col z-40 transform transition-transform duration-200',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <SidebarContent />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 min-h-screen bg-gray-900 text-white flex-col flex-shrink-0">
        <SidebarContent />
      </aside>
    </>
  )
}
