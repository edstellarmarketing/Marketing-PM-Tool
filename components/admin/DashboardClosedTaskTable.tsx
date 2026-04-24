'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import Paginator from '@/components/ui/Paginator'
import type { Task } from '@/types'

type TaskWithProfile = Task & {
  profiles: { full_name: string; avatar_url: string | null; designation: string | null; department: string | null } | null
}

interface Props {
  tasks: TaskWithProfile[]
  emptyMessage: string
}

function ownerInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function DashboardClosedTaskTable({ tasks, emptyMessage }: Props) {
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
                  {owner?.department ? ` · ${owner.department}` : ''}
                  {owner?.designation ? ` · ${owner.designation}` : ''}
                </p>
              </div>

              <div className="text-xs text-gray-400 flex-shrink-0 text-right space-y-0.5">
                <p><span className="text-gray-300">Start</span> {task.start_date ? formatDate(task.start_date) : '—'}</p>
                <p><span className="text-gray-300">End</span> {task.due_date ? formatDate(task.due_date) : '—'}</p>
              </div>

              <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 bg-green-100 text-green-700 font-medium">
                {Math.round(task.score_earned * 100) / 100} pts
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
