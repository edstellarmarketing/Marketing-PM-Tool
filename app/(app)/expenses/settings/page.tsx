import { getModuleAccess } from '@/lib/api'
import ExpenseTabs from '@/components/expenses/ExpenseTabs'
import ExpensesHeader from '@/components/expenses/ExpensesHeader'
import ExpensesNoAccess from '@/components/expenses/NoAccess'
import LookupManager from '@/components/expenses/LookupManager'
import ModuleAccessPanel from '@/components/expenses/ModuleAccessPanel'
import PublicReportPanel from '@/components/expenses/PublicReportPanel'
import WeeklyEmailPanel from '@/components/expenses/WeeklyEmailPanel'

// Restricted module — see app/(app)/expenses/page.tsx for the access notes.
//
// Open to ledger managers so they can maintain the lookups they rely on while
// entering data. The three panels below the lookups are owner-only: they control
// who has access, who is emailed, and a token that exposes spend without a login.
export const dynamic = 'force-dynamic'

export default async function ExpenseSettingsPage() {
  const access = await getModuleAccess('expenses')
  if (!access) return <ExpensesNoAccess />
  // A viewer has nothing to do here — every control on the page is a mutation.
  if (access.role !== 'manager') return <ExpensesNoAccess />

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <ExpensesHeader role={access.role} />
      <ExpenseTabs canManage isOwner={access.isOwner} />

      <LookupManager />

      {access.isOwner && (
        <>
          <ModuleAccessPanel currentUserId={access.profile.id} />
          <PublicReportPanel />
          <WeeklyEmailPanel />
        </>
      )}
    </div>
  )
}
