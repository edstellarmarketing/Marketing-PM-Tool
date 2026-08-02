'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

// In-module navigation. The module has no sidebar entry for people without a
// grant, so these tabs are the only way between its screens.
//
// Settings is for managers and up — it holds lookup management (managers), plus
// access, the public-report token and email recipients (owner only). A viewer
// has nothing to do there, and a tab that only renders a refusal is noise.
const TABS = [
  { href: '/expenses', label: 'Dashboard', managerOnly: false },
  { href: '/expenses/ledger', label: 'Ledger', managerOnly: false },
  { href: '/expenses/subscriptions', label: 'Subscriptions', managerOnly: false },
  { href: '/expenses/settings', label: 'Settings', managerOnly: true },
]

export default function ExpenseTabs({ canManage = false }: { canManage?: boolean; isOwner?: boolean }) {
  const pathname = usePathname()
  const tabs = TABS.filter(t => !t.managerOnly || canManage)

  return (
    <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
      {tabs.map(t => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
              active
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
