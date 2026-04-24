'use client'

import { useState } from 'react'
import { CalendarDays, X } from 'lucide-react'

interface DueTodayTask {
  id: string
  title: string
  status: string
  priority: string
  profiles: { full_name: string; designation: string | null } | null
}

const priorityStyles: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600',
}

const statusStyles: Record<string, string> = {
  blocked: 'bg-red-100 text-red-700',
  in_progress: 'bg-blue-100 text-blue-700',
  review: 'bg-purple-100 text-purple-700',
  todo: 'bg-gray-100 text-gray-600',
  done: 'bg-green-100 text-green-700',
}

export default function DueTodayCard({ tasks }: { tasks: DueTodayTask[] }) {
  const [open, setOpen] = useState(false)
  const count = tasks.length

  return (
    <>
      <button
        onClick={() => count > 0 && setOpen(true)}
        className={`bg-orange-50 rounded-xl p-4 w-full text-left ${count > 0 ? 'cursor-pointer hover:bg-orange-100 transition-colors' : 'cursor-default'}`}
      >
        <div className="flex items-center justify-between">
          <CalendarDays size={20} className="text-orange-500" />
          <span className={`text-2xl font-bold ${count > 0 ? 'text-orange-600 underline decoration-dotted' : 'text-gray-900'}`}>{count}</span>
        </div>
        <p className="text-sm text-gray-600 mt-2">Due Today</p>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Tasks Due Today <span className="text-orange-500 ml-1">({count})</span></h2>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
              {tasks.map(task => (
                <div key={task.id} className="px-6 py-4">
                  <p className="text-sm font-medium text-gray-900">{task.title}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-xs text-gray-600 font-medium">{task.profiles?.full_name ?? 'Unassigned'}</span>
                    {task.profiles?.designation && (
                      <span className="text-xs text-gray-400">· {task.profiles.designation}</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityStyles[task.priority] ?? 'bg-gray-100 text-gray-600'}`}>
                      {task.priority}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyles[task.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {task.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
