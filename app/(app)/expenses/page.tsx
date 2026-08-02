import { getModuleAccess } from '@/lib/api'
import DashboardClient from '@/components/expenses/DashboardClient'
import ExpenseTabs from '@/components/expenses/ExpenseTabs'
import ExpensesNoAccess from '@/components/expenses/NoAccess'
import ExpensesHeader from '@/components/expenses/ExpensesHeader'

// Restricted module (migrations 071 / 075).
//   - The sidebar entry is rendered only for people holding a grant, so the
//     module stays invisible to everyone else.
//   - Reaching a page without a grant shows "No access", not a 404 — the only
//     way here is a link someone shared.
//   - Not reachable from global search (app/api/search/route.ts queries only the
//     caller's own tasks). Keep expenses data out of `tasks`.
export const dynamic = 'force-dynamic'

export default async function ExpensesPage() {
  const access = await getModuleAccess('expenses')
  if (!access) return <ExpensesNoAccess />

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <ExpensesHeader role={access.role} />
      <ExpenseTabs canManage={access.role === 'manager'} />
      <DashboardClient />
    </div>
  )
}
