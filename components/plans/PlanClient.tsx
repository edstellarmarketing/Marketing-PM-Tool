'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PlanningTable from './PlanningTable'
import TaskDetailDrawer from './TaskDetailDrawer'
import PlanGeneratorPanel from '@/components/ai/PlanGeneratorPanel'
import { Rocket, Info, CheckCircle2, ListTodo } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task, MonthlyPlan, Goal, Category } from '@/types'

interface Props {
  plan: MonthlyPlan | null
  month: number
  year: number
  initialTasks: Task[]
  categories: Category[]
}

export default function PlanClient({ plan, month, year, initialTasks, categories: initialCategories }: Props) {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Fresh fetch client-side on mount
    fetchCategories()
  }, [])

  async function fetchCategories() {
    try {
      const res = await fetch('/api/categories', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setCategories(data)
        }
      }
    } catch (err) {
      console.error('Error refreshing categories:', err)
    }
  }

  // Handlers for PlanningTable
  async function handleAddNote(title: string, category?: string) {
    setSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          category,
          plan_id: plan?.id,
          is_draft: true,
          status: 'todo',
          due_date: new Date(year, month, 0).toISOString().split('T')[0], // End of month
        }),
      })
      if (res.ok) {
        const newTask = await res.json()
        setTasks([newTask, ...tasks])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  function handleUpdateTask(updated: Task) {
    setTasks(tasks.map(t => t.id === updated.id ? updated : t))
    if (selectedTask?.id === updated.id) setSelectedTask(updated)
  }

  function handleDeleteTask(id: string) {
    setTasks(tasks.filter(t => t.id !== id))
  }

  function handleSelectTask(task: Task) {
    setSelectedTask(task)
    setIsDrawerOpen(true)
  }

  // Stats
  const draftCount = tasks.filter(t => t.is_draft).length
  const liveCount = tasks.filter(t => !t.is_draft).length
  const completedCount = tasks.filter(t => t.status === 'done').length
  const totalWeight = Math.round(tasks.reduce((sum, t) => sum + (t.score_weight || 0), 0) * 100) / 100
  const earnedScore = Math.round(tasks.reduce((sum, t) => sum + (t.score_earned || 0), 0) * 100) / 100

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 text-gray-400 mb-2">
            <ListTodo size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">Draft Notes</span>
          </div>
          <p className="text-3xl font-black text-gray-900">{draftCount}</p>
          <p className="text-xs text-gray-400 mt-1">Brainstorming phase</p>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 text-blue-500 mb-2">
            <Rocket size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">Active Tasks</span>
          </div>
          <p className="text-3xl font-black text-gray-900">{liveCount}</p>
          <p className="text-xs text-gray-400 mt-1">Committed this month</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3 text-green-500 mb-2">
            <CheckCircle2 size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">Completed</span>
          </div>
          <p className="text-3xl font-black text-gray-900">{completedCount}</p>
          <p className="text-xs text-gray-400 mt-1">Finished objectives</p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-5 shadow-lg shadow-gray-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3 text-gray-400">
              <Info size={18} />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Score Progress</span>
            </div>
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded">
              Capacity: {totalWeight} pts
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <p className="text-3xl font-black text-white">{earnedScore}</p>
            <p className="text-xl font-bold text-gray-500">/ {totalWeight}pts</p>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full mt-3 overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-1000" 
              style={{ width: `${totalWeight > 0 ? Math.min(100, (earnedScore / totalWeight) * 100) : 0}%` }} 
            />
          </div>
        </div>
      </div>

      {/* AI Assistance */}
      <PlanGeneratorPanel
        month={month}
        year={year}
        onImport={async (newGoals) => {
          // Convert goals to draft tasks
          for (const goal of newGoals) {
            await handleAddNote(goal.title)
          }
        }}
      />

      {/* Main Planning Table */}
      <div className="space-y-4">
        <div className="flex items-end justify-between px-2">
          <div>
            <h2 className="text-2xl font-black text-gray-900">Strategic Scratchpad</h2>
            <p className="text-sm text-gray-400 font-medium">Draft your monthly objectives and commit them when ready.</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-3 py-1.5 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Live Month View
          </div>
        </div>
        
        <PlanningTable
          tasks={tasks}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
          onAdd={handleAddNote}
          onSelect={handleSelectTask}
          categories={categories}
        />
      </div>

      {/* Detailed Side View */}
      <TaskDetailDrawer
        task={selectedTask}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onUpdate={handleUpdateTask}
        onDelete={handleDeleteTask}
        categories={categories}
      />
    </div>
  )
}
