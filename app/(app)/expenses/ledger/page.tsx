import { getModuleAccess } from '@/lib/api'
import ExpenseTabs from '@/components/expenses/ExpenseTabs'
import ExpensesHeader from '@/components/expenses/ExpensesHeader'
import ExpensesNoAccess from '@/components/expenses/NoAccess'
import LedgerClient from '@/components/expenses/LedgerClient'

// Restricted module — see app/(app)/expenses/page.tsx for the access notes.
export const dynamic = 'force-dynamic'

export default async function ExpensesLedgerPage() {
  const access = await getModuleAccess('expenses')
  if (!access) return <ExpensesNoAccess />

  // Rendering only — every mutation is re-checked server-side by
  // requireModuleManager().
  const canManage = access.role === 'manager'

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <ExpensesHeader role={access.role} />
      <ExpenseTabs canManage={canManage} />
      <LedgerClient canManage={canManage} isOwner={access.isOwner} />
    </div>
  )
}
