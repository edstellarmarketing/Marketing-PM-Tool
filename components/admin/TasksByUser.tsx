'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Users, Building2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import Paginator from '@/components/ui/Paginator'
import type { Task } from '@/types'

type TaskWithProfile = Task & {
  profiles: { id?: string; full_name: string; avatar_url: string | null; designation: string | null; department: string | null } | null
}

interface Props {
  tasks: TaskWithProfile[]
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function getOwner(t: TaskWithProfile) {
  return Array.isArray(t.profiles) ? t.profiles[0] : t.profiles
}

const statusStyles: Record<string, string> = {
  todo:        'bg-gray-100 text-gray-500',
  in_progress: 'bg-blue-100 text-blue-700',
  review:      'bg-yellow-100 text-yellow-700',
  done:        'bg-green-100 text-green-700',
  blocked:     'bg-red-100 text-red-700',
}

const priorityStyles: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-yellow-100 text-yellow-700',
  low:      'bg-gray-100 text-gray-500',
}

export default function TasksByUser({ tasks }: Props) {
  const [selectedDept, setSelectedDept] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Unique departments sorted alphabetically, with task counts
  const departments = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) {
      const dept = getOwner(t)?.department
      if (dept) map.set(dept, (map.get(dept) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [tasks])

  // Tasks after dept filter
  const deptFiltered = useMemo(() =>
    selectedDept ? tasks.filter(t => getOwner(t)?.department === selectedDept) : tasks,
    [tasks, selectedDept]
  )

  // User pills built from dept-filtered tasks so counts stay accurate
  const users = useMemo(() => {
    const map = new Map<string, { id: string; full_name: string; avatar_url: string | null; count: number }>()
    for (const t of deptFiltered) {
      const owner = getOwner(t)
      if (!owner) continue
      const uid = t.user_id
      if (map.has(uid)) {
        map.get(uid)!.count++
      } else {
        map.set(uid, { id: uid, full_name: owner.full_name, avatar_url: owner.avatar_url, count: 1 })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [deptFiltered])

  // Final task list after both filters
  const filtered = useMemo(() =>
    selectedUserId ? deptFiltered.filter(t => t.user_id === selectedUserId) : deptFiltered,
    [deptFiltered, selectedUserId]
  )

  function selectDept(dept: string | null) {
    setSelectedDept(dept)
    setPage(1)
    if (dept && selectedUserId) {
      const userInDept = deptFiltered.some(t => t.user_id === selectedUserId && getOwner(t)?.department === dept)
      if (!userInDept) setSelectedUserId(null)
    }
  }

  function selectUser(uid: string | null) {
    setSelectedUserId(uid)
    setPage(1)
  }

  const selectedUser = selectedUserId ? users.find(u => u.id === selectedUserId) : null
  const showOwner = selectedUserId === null

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Users size={16} className="text-gray-400" />
          Tasks by User
        </h2>
        <div className="text-right">
          {selectedUser ? (
            <p className="text-sm font-semibold text-blue-600">
              {filtered.length} task{filtered.length !== 1 ? 's' : ''} · {selectedUser.full_name.split(' ')[0]}
            </p>
          ) : (
            <p className="text-sm font-semibold text-gray-700">
              {filtered.length} task{filtered.length !== 1 ? 's' : ''} total
            </p>
          )}
        </div>
      </div>

      {/* Department filter */}
      {departments.length > 0 && (
        <div className="flex items-center gap-1.5 px-5 py-2.5 overflow-x-auto border-b border-gray-100 scrollbar-hide bg-gray-50/60">
          <Building2 size={12} className="text-gray-400 flex-shrink-0 mr-0.5" />
          <button
            onClick={() => selectDept(null)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium flex-shrink-0 transition-colors ${
              selectedDept === null
                ? 'bg-gray-800 text-white'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Depts
          </button>
          {departments.map(d => (
            <button
              key={d.name}
              onClick={() => selectDept(d.name === selectedDept ? null : d.name)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium flex-shrink-0 transition-colors ${
                selectedDept === d.name
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}
            >
              {d.name}
              <span className={`text-[10px] ${selectedDept === d.name ? 'text-gray-300' : 'text-gray-400'}`}>
                {d.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* User filter pills */}
      <div className="flex items-center gap-2 px-5 py-3 overflow-x-auto border-b border-gray-100 scrollbar-hide">
        <button
          onClick={() => selectUser(null)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0 transition-colors ${
            selectedUserId === null
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            selectedUserId === null ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
          }`}>
            {deptFiltered.length}
          </span>
        </button>

        {users.map(u => (
          <button
            key={u.id}
            onClick={() => selectUser(u.id === selectedUserId ? null : u.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0 transition-colors ${
              selectedUserId === u.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <div className="w-4 h-4 rounded-full flex-shrink-0 overflow-hidden">
              {u.avatar_url ? (
                <img src={u.avatar_url} alt={u.full_name} className="w-full h-full object-cover" />
              ) : (
                <div className={`w-full h-full flex items-center justify-center text-[8px] font-bold ${
                  selectedUserId === u.id ? 'bg-blue-400 text-white' : 'bg-gradient-to-br from-blue-500 to-purple-600 text-white'
                }`}>
                  {initials(u.full_name)}
                </div>
              )}
            </div>
            {u.full_name.split(' ')[0]}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              selectedUserId === u.id ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {u.count}
            </span>
          </button>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">No tasks found</p>
      ) : (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                <tr>
                  <th className="text-left py-2.5 px-5">Task</th>
                  {showOwner && <th className="text-left py-2.5 px-4">Owner</th>}
                  <th className="text-left py-2.5 px-4">Status</th>
                  <th className="text-left py-2.5 px-4">Priority</th>
                  <th className="text-left py-2.5 px-4">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.slice((page - 1) * pageSize, page * pageSize).map(task => {
                  const owner = getOwner(task)
                  return (
                    <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-5">
                        <Link
                          href={`/tasks/${task.id}`}
                          className="text-sm font-medium text-gray-900 hover:text-blue-600 block truncate max-w-xs"
                        >
                          {task.title}
                        </Link>
                      </td>
                      {showOwner && (
                        <td className="py-3 px-4">
                          <Link href={`/admin/users/${task.user_id}`} className="flex items-center gap-2 group">
                            <div className="w-6 h-6 rounded-full flex-shrink-0 overflow-hidden">
                              {owner?.avatar_url ? (
                                <img src={owner.avatar_url} alt={owner.full_name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[8px] font-bold">
                                  {owner ? initials(owner.full_name) : '?'}
                                </div>
                              )}
                            </div>
                            <span className="text-xs text-gray-600 group-hover:text-blue-600 truncate max-w-[120px]">
                              {owner?.full_name ?? '—'}
                            </span>
                          </Link>
                        </td>
                      )}
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusStyles[task.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {task.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${priorityStyles[task.priority] ?? 'bg-gray-100 text-gray-500'}`}>
                          {task.priority ?? '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-400 whitespace-nowrap">
                        {task.due_date ? formatDate(task.due_date) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 pb-4">
            <Paginator
              total={filtered.length}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
