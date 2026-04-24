'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, UserCheck, UserX } from 'lucide-react'

type ActionResult = { success: true } | { success: false; error: string }

interface Props {
  isActive: boolean
  updateStatusAction: (isActive: boolean) => Promise<ActionResult>
  removeAccountAction: () => Promise<ActionResult>
}

export default function UserAccountActions({ isActive, updateStatusAction, removeAccountAction }: Props) {
  const router = useRouter()
  const [loadingAction, setLoadingAction] = useState<'status' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function updateStatus() {
    const nextStatus = !isActive
    const label = nextStatus ? 'reactivate' : 'deactivate'
    if (!window.confirm(`Are you sure you want to ${label} this account?`)) return

    setError(null)
    setLoadingAction('status')
    const result = await updateStatusAction(nextStatus)
    setLoadingAction(null)

    if (!result.success) {
      setError(result.error ?? `Failed to ${label} account`)
      return
    }

    router.refresh()
  }

  async function removeAccount() {
    if (!window.confirm('Remove this account permanently? This also deletes related profile data.')) return

    setError(null)
    setLoadingAction('delete')
    const result = await removeAccountAction()
    setLoadingAction(null)

    if (!result.success) {
      setError(result.error ?? 'Failed to remove account')
      return
    }

    router.push('/admin')
    router.refresh()
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={updateStatus}
          disabled={loadingAction !== null}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {isActive ? <UserX size={15} /> : <UserCheck size={15} />}
          {loadingAction === 'status' ? 'Saving...' : isActive ? 'Deactivate' : 'Reactivate'}
        </button>
        <button
          type="button"
          onClick={removeAccount}
          disabled={loadingAction !== null}
          className="inline-flex items-center gap-2 px-4 py-2 border border-red-200 text-sm font-medium text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          <Trash2 size={15} />
          {loadingAction === 'delete' ? 'Removing...' : 'Remove'}
        </button>
      </div>
      {error && <p className="max-w-xs text-right text-xs text-red-600">{error}</p>}
    </div>
  )
}
