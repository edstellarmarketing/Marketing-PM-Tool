'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronLeft, ChevronRight, Zap } from 'lucide-react'

export interface TaskSummary {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
  score_weight: number
  score_earned: number
}

interface Props {
  label: string
  value: number
  icon: React.ReactNode
  bg: string          // e.g. 'bg-blue-50'
  divider: string     // e.g. 'border-blue-100'
  tasks: TaskSummary[]
  emptyMessage?: string
}

const STATUS_STYLE: Record<string, string> = {
  done:        'bg-green-100 text-green-700',
  in_progress: 'bg-blue-100 text-blue-700',
  review:      'bg-purple-100 text-purple-700',
  blocked:     'bg-red-100 text-red-700',
  todo:        'bg-gray-100 text-gray-600',
}

const PRIORITY_STYLE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-yellow-100 text-yellow-700',
  low:      'bg-gray-100 text-gray-500',
}

function fmtDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const PAGE_SIZE = 10

const today = new Date().toISOString().slice(0, 10)

export default function UserStatCard({ label, value, icon, bg, divider, tasks, emptyMessage }: Props) {
  const [open, setOpen] = useState(true)
  const [page, setPage] = useState(0)

  const totalPages = Math.ceil(tasks.length / PAGE_SIZE)
  const pageItems  = tasks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const rangeStart = page * PAGE_SIZE + 1
  const rangeEnd   = Math.min((page + 1) * PAGE_SIZE, tasks.length)

  function toggle() {
    setOpen(o => !o)
    setPage(0)
  }

  return (
    <div className={`${bg} rounded-xl overflow-hidden`}>
      {/* Header — always visible, click to toggle */}
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 pt-4 pb-3 text-left"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-gray-900">{value}</span>
          <ChevronDown
            size={14}
            className={`text-gray-400 transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Task list */}
      {open && (
        <div className={`border-t ${divider} bg-white/60`}>
          {tasks.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">
              {emptyMessage ?? 'No tasks'}
            </p>
          ) : (
            <ul className="divide-y divide-white/80">
              {pageItems.map(task => (
                <li key={task.id}>
                  <Link
                    href={`/tasks/${task.id}`}
                    className="flex items-center gap-2 px-4 py-2.5 hover:bg-white/70 transition-colors group"
                  >
                    {/* Title */}
                    <span className="flex-1 text-xs text-gray-700 group-hover:text-blue-600 truncate min-w-0">
                      {task.title}
                    </span>

                    {/* Due date — always shown; red when past-due and not done */}
                    {task.due_date && (
                      <span className={`text-[10px] font-medium flex-shrink-0 ${task.status !== 'done' && task.due_date < today ? 'text-red-500' : 'text-gray-400'}`}>
                        {fmtDate(task.due_date)}
                      </span>
                    )}

                    {/* Points */}
                    {task.status === 'done' ? (
                      task.score_earned > 0 && (
                        <span className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${task.score_earned > task.score_weight ? 'bg-green-100 text-green-700' : 'bg-green-50 text-green-600'}`}>
                          <Zap size={9} />
                          {Math.round(task.score_earned * 100) / 100}
                          {task.score_earned > task.score_weight && <span className="text-green-500">✦</span>}
                        </span>
                      )
                    ) : (
                      task.score_weight > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 bg-blue-50 text-blue-600">
                          <Zap size={9} />
                          {Math.round(task.score_weight * 100) / 100}
                        </span>
                      )
                    )}

                    {/* Priority badge */}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${PRIORITY_STYLE[task.priority] ?? 'bg-gray-100 text-gray-500'}`}>
                      {task.priority}
                    </span>

                    {/* Status badge */}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_STYLE[task.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {task.status.replace('_', ' ')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <div className={`border-t ${divider} px-4 py-2 flex items-center justify-between`}>
              <span className="text-[11px] text-gray-400">
                {rangeStart}–{rangeEnd} of {tasks.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 0}
                  className="p-1 rounded hover:bg-white/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={13} className="text-gray-500" />
                </button>
                <span className="text-[11px] text-gray-500 px-1">{page + 1} / {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages - 1}
                  className="p-1 rounded hover:bg-white/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={13} className="text-gray-500" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
