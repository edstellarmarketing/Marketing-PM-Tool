'use client'

import { useState } from 'react'
import { UserPlus, Plus, X, Trash2, Upload } from 'lucide-react'
import BulkUploadTasksModal from './BulkUploadTasksModal'
import type { Profile, ProjectOwner } from '@/types'

interface OwnerStat {
  total: number
  completed: number
  in_progress: number
  pending: number
  overdue: number
  progress: number
}

interface Props {
  projectId: string
  owners: ProjectOwner[]
  allMembers: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]
  ownerStats?: Record<string, OwnerStat>
  isAdmin: boolean
  onChange: () => void
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function Avatar({ user, size = 6 }: { user: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>; size?: number }) {
  const cls = `w-${size} h-${size}`
  if (user.avatar_url) {
    return <img src={user.avatar_url} alt={user.full_name} className={`${cls} rounded-full object-cover`} />
  }
  return (
    <div className={`${cls} rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white text-[10px] font-bold flex items-center justify-center`}>
      {initials(user.full_name)}
    </div>
  )
}

export default function ProjectTeamPanel({ projectId, owners, allMembers, ownerStats, isAdmin, onChange }: Props) {
  const [showAddOwner, setShowAddOwner] = useState(owners.length === 0)
  const [newOwner, setNewOwner] = useState({ user_id: '', department: '' })
  const [memberSelectOwnerId, setMemberSelectOwnerId] = useState<string | null>(null)
  const [memberSelectUserId, setMemberSelectUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bulkOwnerId, setBulkOwnerId] = useState<string | null>(null)

  const ownerUserIds = new Set(owners.map(o => o.user_id))

  async function addOwner(e: React.FormEvent) {
    e.preventDefault()
    if (!newOwner.user_id || !newOwner.department.trim()) {
      setError('Pick a user and enter a department')
      return
    }
    setError(null)
    setBusy(true)
    const res = await fetch(`/api/projects/${projectId}/owners`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: newOwner.user_id, department: newOwner.department.trim() }),
    })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data.error === 'string' ? data.error : 'Failed to add owner')
      return
    }
    setNewOwner({ user_id: '', department: '' })
    setShowAddOwner(false)
    onChange()
  }

  async function removeOwner(ownerId: string) {
    if (!confirm('Remove this owner from the project? Their tasks will lose the owner reference.')) return
    setBusy(true)
    const res = await fetch(`/api/projects/${projectId}/owners/${ownerId}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) return
    onChange()
  }

  async function addMember(ownerId: string) {
    if (!memberSelectUserId) return
    setBusy(true)
    const res = await fetch(`/api/projects/${projectId}/owners/${ownerId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: memberSelectUserId }),
    })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data.error === 'string' ? data.error : 'Failed to add member')
      return
    }
    setMemberSelectUserId('')
    setMemberSelectOwnerId(null)
    onChange()
  }

  async function removeMember(ownerId: string, memberId: string) {
    setBusy(true)
    const res = await fetch(`/api/projects/${projectId}/owners/${ownerId}/members/${memberId}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) return
    onChange()
  }

  return (
    <div className="pt-3 space-y-3">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">{error}</p>
      )}

      {owners.length === 0 && !showAddOwner && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {isAdmin ? 'No owners yet. Add one to start creating tasks.' : 'No owners assigned yet. An admin will set up the project team.'}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {owners.map(owner => {
          const ownerMembers = owner.members ?? []
          const takenUserIds = new Set<string>([owner.user_id, ...ownerMembers.map(m => m.user_id)])
          const candidateMembers = allMembers.filter(m => !takenUserIds.has(m.id))
          return (
            <div key={owner.id} className="border border-gray-200 dark:border-gray-800 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {owner.user && <Avatar user={owner.user} size={8} />}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{owner.user?.full_name ?? 'Unknown'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{owner.department}</p>
                  </div>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => removeOwner(owner.id)}
                    disabled={busy}
                    className="p-1 text-gray-400 hover:text-red-600"
                    title="Remove owner"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <button
                onClick={() => setBulkOwnerId(owner.id)}
                disabled={busy}
                className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
              >
                <Upload size={13} />
                Upload Tasks
              </button>

              {ownerStats && ownerStats[owner.id] && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-500 dark:text-gray-400">Department progress</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{ownerStats[owner.id].progress}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600" style={{ width: `${ownerStats[owner.id].progress}%` }} />
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                    <span>{ownerStats[owner.id].completed}/{ownerStats[owner.id].total} done</span>
                    {ownerStats[owner.id].in_progress > 0 && <span className="text-blue-600">{ownerStats[owner.id].in_progress} in progress</span>}
                    {ownerStats[owner.id].overdue > 0 && <span className="text-red-600 font-medium">{ownerStats[owner.id].overdue} overdue</span>}
                  </div>
                </div>
              )}

              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
                  Supporting team ({ownerMembers.length})
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ownerMembers.map(m => m.user && (
                    <span key={m.id} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs text-gray-700 dark:text-gray-200">
                      <Avatar user={m.user} size={5} />
                      {m.user.full_name}
                      {isAdmin && (
                        <button
                          onClick={() => removeMember(owner.id, m.id)}
                          className="text-gray-400 hover:text-red-600"
                          disabled={busy}
                        >
                          <X size={11} />
                        </button>
                      )}
                    </span>
                  ))}
                  {!isAdmin ? null : memberSelectOwnerId === owner.id ? (
                    <div className="flex items-center gap-1.5">
                      <select
                        autoFocus
                        value={memberSelectUserId}
                        onChange={e => setMemberSelectUserId(e.target.value)}
                        className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded"
                      >
                        <option value="">Select member…</option>
                        {candidateMembers.map(m => (
                          <option key={m.id} value={m.id}>{m.full_name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => addMember(owner.id)}
                        disabled={busy || !memberSelectUserId}
                        className="text-xs px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
                      >
                        Add
                      </button>
                      <button
                        onClick={() => { setMemberSelectOwnerId(null); setMemberSelectUserId('') }}
                        className="text-xs px-1 text-gray-500 hover:text-gray-700"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setMemberSelectOwnerId(owner.id)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 border border-dashed border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-full hover:border-blue-500 hover:text-blue-600"
                    >
                      <Plus size={11} />
                      Add
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {!isAdmin ? null : showAddOwner ? (
        <form onSubmit={addOwner} className="border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 rounded-lg p-3 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Owner</label>
            <select
              required
              value={newOwner.user_id}
              onChange={e => setNewOwner(p => ({ ...p, user_id: e.target.value }))}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded"
            >
              <option value="">Select a user…</option>
              {allMembers.filter(m => !ownerUserIds.has(m.id)).map(m => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Department</label>
            <input
              required
              type="text"
              value={newOwner.department}
              onChange={e => setNewOwner(p => ({ ...p, department: e.target.value }))}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded"
              placeholder="Frontend, Backend, Content…"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
          >
            <UserPlus size={14} />
            Add Owner
          </button>
          {owners.length > 0 && (
            <button
              type="button"
              onClick={() => { setShowAddOwner(false); setError(null) }}
              className="text-sm text-gray-500 hover:text-gray-700 px-2"
            >
              Cancel
            </button>
          )}
        </form>
      ) : (
        <button
          onClick={() => setShowAddOwner(true)}
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
        >
          <Plus size={14} />
          Add owner
        </button>
      )}

      {bulkOwnerId && (() => {
        const o = owners.find(x => x.id === bulkOwnerId)
        if (!o) return null
        return (
          <BulkUploadTasksModal
            projectId={projectId}
            owner={o}
            allMembers={allMembers}
            onClose={() => setBulkOwnerId(null)}
            onImported={() => { setBulkOwnerId(null); onChange() }}
          />
        )
      })()}
    </div>
  )
}
