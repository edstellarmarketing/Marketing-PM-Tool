'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import Paginator from '@/components/ui/Paginator'
import type { Task, Priority, TaskStatus } from '@/types'

type TaskWithProfile = Task & {
  profiles: { full_name: string; avatar_url: string | null; designation: string | null; department: string | null } | null
}

interface Props {
  tasks: TaskWithProfile[]
  emptyMessage: string
  showProgress?: boolean
}

function ownerInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function statusColor(status: TaskStatus | string) {
  switch (status) {
    case 'done':        return 'bg-green-100 text-green-700'
    case 'in_progress': return 'bg-blue-100 text-blue-700'
    case 'blocked':     return 'bg-red-100 text-red-700'
    case 'review':      return 'bg-purple-100 text-purple-700'
    default:            return 'bg-gray-100 text-gray-600'
  }
}

function priorityColor(priority: Priority | string) {
  switch (priority) {
    case 'critical': return 'bg-red-100 text-red-700'
    case 'high':     return 'bg-orange-100 text-orange-700'
    case 'medium':   return 'bg-yellow-100 text-yellow-700'
    default:         return 'bg-gray-100 text-gray-500'
  }
}

export default function DashboardTaskTable({ tasks, emptyMessage, showProgress = false }: Props) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  if (tasks.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-6">{emptyMessage}</p>
  }

  const paginated = tasks.slice((page - 1) * pageSize, page * pageSize)

  return (
    <>
      <div className="divide-y divide-gray-100">
        {paginated.map(task => {
          const owner = Array.isArray(task.profiles) ? task.profiles[0] : task.profiles
          const subtasks = task.subtasks ?? []
          const totalSub = subtasks.length
          const doneSub = subtasks.filter(s => s.completed).length
          const pct = totalSub > 0 ? Math.round((doneSub / totalSub) * 100) : 0

          return (
            <div key={task.id} className="flex items-center gap-3 py-3">
              <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden">
                {owner?.avatar_url ? (
                  <img src={owner.avatar_url} alt={owner.full_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                    {owner ? ownerInitials(owner.full_name) : '?'}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <Link
                  href={`/tasks/${task.id}`}
                  className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block"
                >
                  {task.title}
                </Link>
                <p className="text-xs text-gray-400 truncate">
                  {owner?.full_name ?? 'Unknown'}
                  {owner?.designation ? ` · ${owner.designation}` : ''}
                </p>
              </div>

              {showProgress && (
                <div className="w-32 flex-shrink-0">
                  {totalSub > 0 ? (
                    <>
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>{doneSub}/{totalSub} subtasks</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-gray-300">No subtasks</span>
                  )}
                </div>
              )}

              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${statusColor(task.status)}`}>
                {task.status.replace('_', ' ')}
              </span>

              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 capitalize ${priorityColor(task.priority)}`}>
                {task.priority}
              </span>

              <span className="text-xs text-gray-400 flex-shrink-0 w-20 text-right">
                {task.due_date ? formatDate(task.due_date) : '—'}
              </span>
            </div>
          )
        })}
      </div>

      <Paginator
        total={tasks.length}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
      />
    </>
  )
}
