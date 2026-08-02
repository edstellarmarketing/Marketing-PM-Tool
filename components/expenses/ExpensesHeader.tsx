import { Eye, PencilLine } from 'lucide-react'
import type { ModuleRole } from '@/lib/api'

// Shared page header. Shows the caller their own role, because a viewer who
// cannot see why the Add and Edit buttons are missing will assume the page is
// broken rather than that they are read-only.
export default function ExpensesHeader({ role }: { role: ModuleRole }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Expenses</h1>
        <p className="text-sm text-gray-500 mt-1">
          Restricted module. Visible only to people explicitly granted access.
        </p>
      </div>
      <span
        className={
          role === 'manager'
            ? 'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
            : 'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
        }
      >
        {role === 'manager' ? <PencilLine size={12} /> : <Eye size={12} />}
        {role === 'manager' ? 'Ledger manager' : 'View only'}
      </span>
    </div>
  )
}
