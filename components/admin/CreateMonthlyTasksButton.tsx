'use client'

import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'

export default function CreateMonthlyTasksButton() {
  const pathname = usePathname()
  if (pathname !== '/admin/monthly-tasks') return null

  return (
    <button
      type="button"
      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
    >
      <Plus size={14} />
      Create Monthly Tasks
    </button>
  )
}
