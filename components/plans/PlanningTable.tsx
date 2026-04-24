'use client'

import { useState } from 'react'
import { Rocket, Plus, ChevronRight, Info, Zap, Link as LinkIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task, Category } from '@/types'

interface Props {
  tasks: Task[]
  onUpdate: (updated: Task) => void
  onDelete: (id: string) => void
  onAdd: (title: string, category?: string) => Promise<void>
  onSelect: (task: Task) => void
  categories: Category[]
}

export default function PlanningTable({ tasks, onUpdate, onDelete, onAdd, onSelect, categories }: Props) {
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [adding, setAdding] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newTitle.trim() || adding) return
    setAdding(true)
    await onAdd(newTitle, newCategory)
    setNewTitle('')
    setNewCategory('')
    setAdding(false)
  }

  async function commitTask(e: React.MouseEvent, task: Task) {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_draft: false,
          status: 'todo',
          description: task.description || task.strategic_notes,
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        onUpdate(updated)
      }
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-gray-50/50 border-b border-gray-100">
            <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest w-1/2">Title</th>
            <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">Category</th>
            <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-center">Weight</th>
            <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-center">Status</th>
            <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {tasks.map(task => (
            <tr 
              key={task.id} 
              onClick={() => onSelect(task)}
              className={cn(
                "group cursor-pointer transition-colors",
                task.is_draft ? "hover:bg-gray-50/80" : "hover:bg-blue-50/30"
              )}
            >
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-1 h-1 rounded-full transition-all group-hover:h-4",
                    task.is_draft ? "bg-gray-300" : "bg-blue-500"
                  )} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        "text-sm font-semibold transition-colors",
                        task.is_draft ? "text-gray-600" : "text-gray-900 group-hover:text-blue-600"
                      )}>
                        {task.title}
                      </p>
                      {task.parent_task_id && (
                        <span className="flex items-center gap-1 text-[9px] font-black bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                          <LinkIcon size={8} /> Dependency
                        </span>
                      )}
                    </div>
                    {task.strategic_notes && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-1 flex items-center gap-1">
                        <Info size={10} /> {task.strategic_notes}
                      </p>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                {task.category ? (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-500 uppercase tracking-wider">
                    {task.category}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300 italic">No category</span>
                )}
              </td>
              <td className="px-6 py-4 text-center">
                {task.score_weight > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
                    <Zap size={10} /> {Math.round(task.score_weight * 100) / 100} pts
                  </span>
                ) : (
                  <span className="text-sm text-gray-300">—</span>
                )}
              </td>
              <td className="px-6 py-4 text-center">
                {task.is_draft ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                    Draft
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-600 uppercase tracking-wider">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    Live
                  </span>
                )}
              </td>
              <td className="px-6 py-4 text-right">
                {task.is_draft ? (
                  <button
                    onClick={(e) => commitTask(e, task)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-blue-600 text-white text-[11px] font-bold rounded-lg transition-all transform hover:scale-105"
                  >
                    <Rocket size={12} />
                    Commit
                  </button>
                ) : (
                  <div className="flex justify-end pr-2 text-gray-300">
                    <ChevronRight size={18} />
                  </div>
                )}
              </td>
            </tr>
          ))}

          {/* Inline Quick Add Row */}
          <tr className="bg-gray-50/30">
            <td colSpan={5} className="px-4 py-3">
              <form onSubmit={handleAdd} className="flex flex-col md:flex-row items-center gap-3">
                <div className="flex-1 flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all w-full">
                  <Plus size={16} className="text-gray-400" />
                  <input
                    type="text"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="Quick add a note or plan for this month..."
                    className="flex-1 text-sm border-none p-0 focus:ring-0 placeholder:text-gray-400 font-medium"
                    disabled={adding}
                  />
                </div>
                
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-medium text-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50 w-full md:w-auto"
                  disabled={adding}
                >
                  <option value="">Select Category</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>

                <button
                  type="submit"
                  disabled={!newTitle.trim() || adding}
                  className="px-6 py-2 bg-white border border-gray-200 hover:border-blue-500 hover:text-blue-600 text-gray-600 text-sm font-bold rounded-xl transition-all disabled:opacity-50 shadow-sm whitespace-nowrap w-full md:w-auto"
                >
                  {adding ? 'Adding...' : 'Add Note'}
                </button>
              </form>
            </td>
          </tr>
        </tbody>
      </table>
      
      {tasks.length === 0 && !adding && (
        <div className="py-20 text-center">
          <p className="text-gray-400 text-sm font-medium italic">No plans yet for this month. Start by adding a note above.</p>
        </div>
      )}
    </div>
  )
}
