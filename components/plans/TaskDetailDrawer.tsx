'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Calendar, BarChart, Tag, Trash2, Rocket, Save, Loader2, Edit3, Link as LinkIcon, Plus, User, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import ScoringClassification from '@/components/tasks/ScoringClassification'
import { computeScorePreview } from '@/lib/scoring'
import type { Task, Priority, Category, Profile, PointConfig, TaskType, Complexity } from '@/types'

interface Props {
  task: Task | null
  isOpen: boolean
  onClose: () => void
  onUpdate: (updated: Task) => void
  onDelete: (id: string) => void
  categories: Category[]
}

export default function TaskDetailDrawer({ task, isOpen, onClose, onUpdate, onDelete, categories }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState<Task | null>(null)
  const [saving, setSaving] = useState(false)
  const [committing, setCommitting] = useState<'live' | 'edit' | null>(null)
  
  // Dependencies states
  const [children, setChildren] = useState<Task[]>([])
  const [loadingChildren, setLoadingChildren] = useState(false)
  const [users, setUsers] = useState<Profile[]>([])
  const [configs, setConfigs] = useState<PointConfig[]>([])
  const [showAddDep, setShowAddDep] = useState(false)
  const [depForm, setDepForm] = useState({
    title: '',
    user_id: '',
    due_date: '',
    task_type: '' as TaskType,
    complexity: '' as Complexity,
    category: '',
    priority: 'medium' as Priority,
  })
  const [addingDep, setAddingDep] = useState(false)
  const [approvingDep, setApprovingDep] = useState<string | null>(null)

  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    setEditing(task)
    if (task && isOpen) {
      fetchChildren(task.id)
      fetchUsers()
      fetchConfigs()
      fetchProfile()
    }
  }, [task, isOpen])

  async function fetchProfile() {
    try {
      const res = await fetch('/api/profile')
      if (res.ok) {
        const data = await res.json()
        setIsAdmin(data.role === 'admin')
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function fetchChildren(id: string) {
    setLoadingChildren(true)
    try {
      const res = await fetch(`/api/tasks/${id}`)
      if (res.ok) {
        const data = await res.json()
        setChildren(data.children || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingChildren(false)
    }
  }

  async function fetchUsers() {
    try {
      const res = await fetch('/api/users')
      if (res.ok) setUsers(await res.json())
    } catch (err) {
      console.error(err)
    }
  }

  async function fetchConfigs() {
    try {
      const res = await fetch('/api/point-config')
      if (res.ok) setConfigs(await res.json())
    } catch (err) {
      console.error(err)
    }
  }

  if (!task || !editing) return null

  async function handleSave() {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editing.title,
          strategic_notes: editing.strategic_notes,
          description: editing.description || editing.strategic_notes,
          category: editing.category,
          priority: editing.priority,
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        onUpdate(updated)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddDep(e: React.FormEvent) {
    e.preventDefault()
    if (!depForm.user_id || !depForm.title) return
    setAddingDep(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...depForm,
          parent_task_id: task!.id,
          due_date: depForm.due_date || task!.due_date,
        }),
      })
      if (res.ok) {
        const newDep = await res.json()
        setChildren([...children, newDep])
        setShowAddDep(false)
        setDepForm({
          title: '',
          user_id: '',
          due_date: '',
          task_type: '' as TaskType,
          complexity: '' as Complexity,
          category: '',
          priority: 'medium',
        })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setAddingDep(false)
    }
  }

  async function approveDependency(depId: string) {
    setApprovingDep(depId)
    try {
      const res = await fetch(`/api/tasks/${depId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_dependency' }),
      })
      if (res.ok) {
        const updated = await res.json()
        setChildren(children.map(c => c.id === depId ? updated : c))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setApprovingDep(null)
    }
  }

  async function handleCommit(mode: 'live' | 'edit') {
    if (!editing) return
    setCommitting(mode)
    try {
      const res = await fetch(`/api/tasks/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_draft: false,
          status: 'todo',
          description: editing.description || editing.strategic_notes,
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        onUpdate(updated)
        if (mode === 'edit') {
          router.push(`/tasks/${updated.id}/edit`)
        } else {
          onClose()
        }
      } else {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to commit task')
      }
    } catch (err) {
      console.error(err)
      alert('Failed to commit task')
    } finally {
      setCommitting(null)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Are you sure you want to delete this plan item?')) return
    try {
      const res = await fetch(`/api/tasks/${task!.id}`, { method: 'DELETE' })
      if (res.ok) {
        onDelete(task!.id)
        onClose()
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Dependency form has no subtasks UI, so volume bonus is 0
  const depPreview = computeScorePreview(configs, depForm.task_type ?? '', depForm.complexity ?? '', 0)

  return (
    <>
      {/* Overlay */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div 
        className={cn(
          "fixed inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded",
              task.is_draft ? "bg-gray-100 text-gray-500" : "bg-blue-100 text-blue-700"
            )}>
              {task.is_draft ? 'Draft Plan' : 'Active Task'}
            </span>
            {task.parent_task_id && (
              <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                Dependency
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {/* Title */}
          <input
            type="text"
            value={editing.title}
            onChange={e => setEditing({ ...editing, title: e.target.value })}
            className="w-full text-2xl font-bold text-gray-900 border-none p-0 focus:ring-0 placeholder:text-gray-300"
            placeholder="Item Title..."
          />

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <Tag size={12} /> Category
              </label>
              <select
                value={editing.category ?? ''}
                onChange={e => setEditing({ ...editing, category: e.target.value })}
                className="w-full text-sm font-medium text-gray-700 bg-gray-50 border-none rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No Category</option>
                {categories.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <BarChart size={12} /> Potential Score
              </label>
              <div className="w-full text-sm font-bold text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
                {editing.score_weight > 0 ? `${editing.score_weight} pts` : 'Set type & complexity on task'}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              Strategic Notes
            </label>
            <textarea
              value={editing.strategic_notes ?? ''}
              onChange={e => setEditing({ ...editing, strategic_notes: e.target.value })}
              className="w-full h-40 text-sm text-gray-600 bg-gray-50 border-none rounded-xl p-4 focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-300"
              placeholder="What are the key objectives and plans for this item? Brainstorm here..."
            />
          </div>

          {/* Dependencies Section */}
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <LinkIcon size={12} /> Linked Dependencies
              </label>
              <button 
                onClick={() => setShowAddDep(!showAddDep)}
                className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700"
              >
                <Plus size={14} /> Add Dependency
              </button>
            </div>

            {showAddDep && (
              <form onSubmit={handleAddDep} className="bg-gray-50 rounded-xl p-4 space-y-4 border border-blue-100">
                <input
                  required
                  type="text"
                  placeholder="Dependency Title"
                  value={depForm.title}
                  onChange={e => setDepForm({...depForm, title: e.target.value})}
                  className="w-full text-sm bg-white border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                
                <div className="grid grid-cols-2 gap-3">
                  <select
                    required
                    value={depForm.user_id}
                    onChange={e => setDepForm({...depForm, user_id: e.target.value})}
                    className="text-sm bg-white border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Assignee</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={depForm.due_date}
                    onChange={e => setDepForm({...depForm, due_date: e.target.value})}
                    className="text-sm bg-white border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <ScoringClassification
                  configs={configs}
                  taskType={depForm.task_type}
                  complexity={depForm.complexity}
                  onTypeChange={v => setDepForm({...depForm, task_type: v as TaskType})}
                  onComplexityChange={v => setDepForm({...depForm, complexity: v as Complexity})}
                  preview={depPreview}
                />

                <div className="flex justify-end gap-2">
                  <button 
                    type="button" 
                    onClick={() => setShowAddDep(false)}
                    className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={addingDep}
                    className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {addingDep ? 'Adding...' : 'Create Dependency'}
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2">
              {loadingChildren ? (
                <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin text-gray-300" /></div>
              ) : children.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-2">No dependencies linked yet.</p>
              ) : (
                children.map(child => (
                  <div key={child.id} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        <User size={14} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{child.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                            child.status === 'done' ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                          )}>
                            {child.status}
                          </span>
                          <span className="text-[10px] text-gray-400 font-medium">
                            {child.score_weight} pts
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {child.status === 'done' && child.approval_status === 'pending_approval' ? (
                      <button 
                        onClick={() => approveDependency(child.id)}
                        disabled={approvingDep === child.id}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold rounded-lg transition-all"
                      >
                        {approvingDep === child.id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        Approve
                      </button>
                    ) : child.approval_status === 'approved' && child.status === 'done' ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 uppercase">
                        <CheckCircle2 size={12} /> Approved
                      </span>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          {isAdmin ? (
            <button
              onClick={handleDelete}
              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete Item"
            >
              <Trash2 size={20} />
            </button>
          ) : <div />}
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !!committing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-white rounded-lg transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save Changes
            </button>
            
            {task.is_draft && (
              <>
                <button
                  onClick={() => handleCommit('live')}
                  disabled={saving || !!committing}
                  className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 text-sm font-bold rounded-lg hover:bg-blue-50 transition-all disabled:opacity-50"
                >
                  {committing === 'live' ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
                  Go Live
                </button>
                <button
                  onClick={() => handleCommit('edit')}
                  disabled={saving || !!committing}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg shadow-lg shadow-blue-200 transition-all disabled:opacity-50"
                >
                  {committing === 'edit' ? <Loader2 size={16} className="animate-spin" /> : <Edit3 size={16} />}
                  Commit & Edit
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
