import { getModuleAccess } from '@/lib/api'
import ExpenseTabs from '@/components/expenses/ExpenseTabs'
import ExpensesHeader from '@/components/expenses/ExpensesHeader'
import ExpensesNoAccess from '@/components/expenses/NoAccess'
import SubscriptionsClient from '@/components/expenses/SubscriptionsClient'

// Restricted module — see app/(app)/expenses/page.tsx for the access notes.
export const dynamic = 'force-dynamic'

export default async function ExpenseSubscriptionsPage() {
  const access = await getModuleAccess('expenses')
  if (!access) return <ExpensesNoAccess />

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <ExpensesHeader role={access.role} />
      <ExpenseTabs canManage={access.role === 'manager'} />
      <SubscriptionsClient canManage={access.role === 'manager'} />
    </div>
  )
}
