'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Users, Building2, UserPlus, Send, Trash2, Pencil, Check, X, Plus, Loader2 } from 'lucide-react'
import InviteUserModal from './InviteUserModal'
import type { Profile, Category } from '@/types'

interface UserWithEmail extends Profile {
  email: string | null
}

interface Props {
  users: UserWithEmail[]
  departments: Category[]
  currentUserId: string
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function AdminClient({ users: initialUsers, departments: initialDepts, currentUserId }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'users' | 'departments'>('users')
  const [showInvite, setShowInvite] = useState(false)
  const [users, setUsers] = useState(initialUsers)
  const [departments, setDepartments] = useState(initialDepts)

  // User management state
  const [resetingId, setResetingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [userError, setUserError] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState<string | null>(null)

  // Department management state
  const [newDeptName, setNewDeptName] = useState('')
  const [addingDept, setAddingDept] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deptError, setDeptError] = useState<string | null>(null)

  async function sendResetLink(email: string | null, userId: string) {
    if (!email) return
    setResetingId(userId)
    setUserError(null)
    setResetSuccess(null)
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setResetingId(null)
    if (!res.ok) {
      const data = await res.json()
      setUserError(data.error ?? 'Failed to send reset link')
    } else {
      setResetSuccess(`Password reset link sent to ${email}`)
      setTimeout(() => setResetSuccess(null), 4000)
    }
  }

  async function removeUser(userId: string, name: string) {
    if (!window.confirm(`Remove ${name} permanently? This also deletes their tasks and profile data.`)) return
    setRemovingId(userId)
    setUserError(null)
    const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
    setRemovingId(null)
    if (!res.ok) {
      const data = await res.json()
      setUserError(data.error ?? 'Failed to remove user')
    } else {
      setUsers(prev => prev.filter(u => u.id !== userId))
    }
  }

  async function addDepartment(e: React.FormEvent) {
    e.preventDefault()
    if (!newDeptName.trim() || addingDept) return
    setAddingDept(true)
    setDeptError(null)
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDeptName.trim() }),
    })
    setAddingDept(false)
    if (!res.ok) {
      const data = await res.json()
      setDeptError(data.error ?? 'Failed to add department')
    } else {
      const dept = await res.json()
      setDepartments(prev => [...prev, dept].sort((a, b) => a.name.localeCompare(b.name)))
      setNewDeptName('')
    }
  }

  async function saveDeptEdit(id: string) {
    if (!editName.trim()) return
    setDeptError(null)
    const res = await fetch(`/api/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim() }),
    })
    if (!res.ok) {
      const data = await res.json()
      setDeptError(data.error ?? 'Failed to rename department')
    } else {
      setDepartments(prev =>
        prev.map(d => d.id === id ? { ...d, name: editName.trim() } : d)
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      setEditingId(null)
    }
  }

  async function deleteDepartment(id: string, name: string) {
    if (!window.confirm(`Delete department "${name}"? This removes it from the dropdown options.`)) return
    setDeptError(null)
    const res = await fetch(`/api/categories?id=${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setDeptError(data.error ?? 'Failed to delete department')
    } else {
      setDepartments(prev => prev.filter(d => d.id !== id))
    }
  }

  const tabs = [
    { key: 'users' as const, label: 'User Management', icon: <Users size={16} /> },
    { key: 'departments' as const, label: 'Department Management', icon: <Building2 size={16} /> },
  ]

  return (
    <>
      {/* Tab nav */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── User Management ── */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{users.length} user{users.length !== 1 ? 's' : ''}</p>
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <UserPlus size={15} />
              Invite User
            </button>
          </div>

          {userError && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg">{userError}</div>
          )}
          {resetSuccess && (
            <div className="p-3 bg-green-50 border border-green-100 text-green-700 text-sm rounded-lg">{resetSuccess}</div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left py-3 px-4">User</th>
                  <th className="text-left py-3 px-4">Department</th>
                  <th className="text-left py-3 px-4">Role</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Email</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3 group">
                        <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt={u.full_name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                              {initials(u.full_name)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 truncate">{u.full_name}</p>
                          {u.designation && <p className="text-xs text-gray-400 truncate">{u.designation}</p>}
                        </div>
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{u.department ?? '—'}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {u.is_active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">{u.email ?? '—'}</td>
                    <td className="py-3 px-4">
                      {u.id !== currentUserId ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => sendResetLink(u.email, u.id)}
                            disabled={resetingId === u.id || !u.email}
                            title={!u.email ? 'No email on record' : 'Send password reset link'}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                          >
                            {resetingId === u.id
                              ? <Loader2 size={12} className="animate-spin" />
                              : <Send size={12} />}
                            Reset Password
                          </button>
                          <button
                            onClick={() => removeUser(u.id, u.full_name)}
                            disabled={removingId === u.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
                          >
                            {removingId === u.id
                              ? <Loader2 size={12} className="animate-spin" />
                              : <Trash2 size={12} />}
                            Remove
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 text-right">you</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Department Management ── */}
      {tab === 'departments' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            {departments.length} department{departments.length !== 1 ? 's' : ''} — these appear in user profiles and invite forms
          </p>

          {deptError && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-lg">{deptError}</div>
          )}

          {/* Add form */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Add Department</h2>
            <form onSubmit={addDepartment} className="flex gap-2">
              <input
                type="text"
                value={newDeptName}
                onChange={e => setNewDeptName(e.target.value)}
                placeholder="e.g. Marketing, Content, SEO"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={addingDept}
              />
              <button
                type="submit"
                disabled={!newDeptName.trim() || addingDept}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {addingDept ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Add
              </button>
            </form>
          </div>

          {/* Department list */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {departments.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No departments yet</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {departments.map(dept => (
                  <div key={dept.id} className="flex items-center gap-3 px-5 py-3">
                    {editingId === dept.id ? (
                      <>
                        <input
                          autoFocus
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveDeptEdit(dept.id)
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          className="flex-1 text-sm border border-blue-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => saveDeptEdit(dept.id)}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Save"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium text-gray-900">{dept.name}</span>
                        <button
                          onClick={() => { setEditingId(dept.id); setEditName(dept.name) }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Rename"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => deleteDepartment(dept.id, dept.name)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showInvite && (
        <InviteUserModal onClose={() => { setShowInvite(false); router.refresh() }} />
      )}
    </>
  )
}
