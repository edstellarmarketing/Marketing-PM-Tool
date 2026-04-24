import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PendingApprovalsTable from '@/components/admin/PendingApprovalsTable'

export default async function PendingApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pending Approvals</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isAdmin
            ? 'Review pending task completions and date change requests, or browse previously approved and rejected records.'
            : 'Review dependency tasks assigned by you that team members have completed, plus their date change requests.'}
        </p>
      </div>
      <PendingApprovalsTable isAdmin={isAdmin} />
    </div>
  )
}
