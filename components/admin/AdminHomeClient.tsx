'use client'

import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import InviteUserModal from './InviteUserModal'

export default function AdminHomeClient({ children }: { children: React.ReactNode }) {
  const [showInvite, setShowInvite] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Team overview and management</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus size={16} /> Invite Member
        </button>
      </div>
      {children}
      {showInvite && <InviteUserModal onClose={() => setShowInvite(false)} />}
    </>
  )
}
