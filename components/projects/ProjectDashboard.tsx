'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus, Search, Filter, ArrowLeft, TrendingUp, ListChecks, Loader2, AlertCircle, CheckCircle2, Calendar, Users, Pencil,
} from 'lucide-react'
import AddProjectTaskDrawer from './AddProjectTaskDrawer'
import ProjectTeamPanel from './ProjectTeamPanel'
import type { Project, ProjectTask, Profile, ProjectOwner } from '@/types'

interface Props {
  project: Project
  tasks: ProjectTask[]
  owners: ProjectOwner[]
  allMembers: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]
}

const PAGE_SIZE = 10

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function isOverdue(t: ProjectTask, today: string) {
  return t.status !== 'completed' && !!t.due_date && t.due_date < today
}

const statusStyle: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  overdue: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
}

const priorityStyle: Record<string, string> = {
  low: 'text-gray-500',
  medium: 'text-blue-600',
  high: 'text-orange-600',
  critical: 'text-red-600',
}

export default function ProjectDashboard({ project, tasks, owners, allMembers }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [activeOwnerId, setActiveOwnerId] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null)
  const [teamOpen, setTeamOpen] = useState(owners.length === 0)

  const today = new Date().toISOString().slice(0, 10)
  const ownersById = useMemo(() => new Map(owners.map(o => [o.id, o])), [owners])

  const stats = useMemo(() => {
    let total = 0, completed = 0, in_progress = 0, pending = 0, overdue = 0
    tasks.forEach(t => {
      total += 1
      if (t.status === 'completed') completed += 1
      else if (t.status === 'in_progress') in_progress += 1
      else pending += 1
      if (isOverdue(t, today)) overdue += 1
    })
    const progress = total === 0 ? 0 : Math.round((completed / total) * 100)
    return { total, completed, in_progress, pending, overdue, progress }
  }, [tasks, today])

  const ownerStats = useMemo(() => {
    const map: Record<string, { total: number; completed: number; in_progress: number; pending: number; overdue: number; progress: number }> = {}
    owners.forEach(o => { map[o.id] = { total: 0, completed: 0, in_progress: 0, pending: 0, overdue: 0, progress: 0 } })
    tasks.forEach(t => {
      if (!t.owner_id || !map[t.owner_id]) return
      const s = map[t.owner_id]
      s.total += 1
      if (t.status === 'completed') s.completed += 1
      else if (t.status === 'in_progress') s.in_progress += 1
      else s.pending += 1
      if (isOverdue(t, today)) s.overdue += 1
    })
    Object.values(map).forEach(s => { s.progress = s.total === 0 ? 0 : Math.round((s.completed / s.total) * 100) })
    return map
  }, [tasks, owners, today])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter(t => {
      if (activeOwnerId !== 'all' && t.owner_id !== activeOwnerId) return false
      if (q && !t.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [tasks, activeOwnerId, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const canAddTask = owners.length > 0

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 mb-3"
        >
          <ArrowLeft size={14} />
          All Projects
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-3xl">{project.description}</p>
            )}
          </div>
          <div className="text-right text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 whitespace-nowrap">
            <Calendar size={14} />
            <span>{formatDate(project.start_date)} – {formatDate(project.end_date)}</span>
          </div>
        </div>
      </div>

      {/* Overview cards */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1.5">
              <TrendingUp size={14} />
              <span>Overall Progress</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.progress}%</p>
            <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-blue-600" style={{ width: `${stats.progress}%` }} />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1.5">
              <ListChecks size={14} />
              <span>Total Tasks</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs text-blue-600 mb-1.5">
              <Loader2 size={14} />
              <span>In Progress</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.in_progress}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs text-amber-600 mb-1.5">
              <AlertCircle size={14} />
              <span>Pending</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pending}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs text-red-600 mb-1.5">
              <AlertCircle size={14} />
              <span>Overdue</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.overdue}</p>
          </div>
        </div>
      </div>

      {/* Project team */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
        <button
          onClick={() => setTeamOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <Users size={16} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Project Team</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {owners.length} owner{owners.length === 1 ? '' : 's'}
            </span>
          </div>
          <span className="text-xs text-blue-600">{teamOpen ? 'Hide' : 'Show'}</span>
        </button>
        {teamOpen && (
          <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800">
            <ProjectTeamPanel
              projectId={project.id}
              owners={owners}
              allMembers={allMembers}
              ownerStats={ownerStats}
              onChange={() => router.refresh()}
            />
          </div>
        )}
      </div>

      {/* Tabs + search + filters + add */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
        {owners.length > 0 && (
          <div className="px-4 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Department Progress</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {owners.map(owner => {
                const s = ownerStats[owner.id]
                return (
                  <button
                    key={owner.id}
                    onClick={() => { setActiveOwnerId(owner.id); setPage(1) }}
                    className={`text-left p-2.5 rounded-lg border transition-colors ${
                      activeOwnerId === owner.id
                        ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
                        : 'border-gray-200 dark:border-gray-800 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{owner.department}</span>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{s.progress}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600" style={{ width: `${s.progress}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                      <span>{s.completed}/{s.total} done</span>
                      {s.overdue > 0 && <span className="text-red-600 font-medium">{s.overdue} overdue</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => { setActiveOwnerId('all'); setPage(1) }}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                activeOwnerId === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              All Tasks
            </button>
            {owners.map(owner => {
              const s = ownerStats[owner.id]
              const active = activeOwnerId === owner.id
              return (
                <button
                  key={owner.id}
                  onClick={() => { setActiveOwnerId(owner.id); setPage(1) }}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                  title={owner.user?.full_name ?? ''}
                >
                  {owner.department}
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-800'}`}>
                    {s.progress}%
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search tasks…"
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
              <Filter size={14} />
              Filters
            </button>
            <button
              onClick={() => setDrawerOpen(true)}
              disabled={!canAddTask}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title={canAddTask ? 'Add a new task' : 'Add a project owner first'}
            >
              <Plus size={14} />
              Add Task
            </button>
          </div>
        </div>

        {/* Task table */}
        <div className="mt-3 overflow-x-auto">
          <table className="text-sm min-w-[2200px] w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                <th className="px-4 py-2 font-medium w-64">Task</th>
                <th className="px-4 py-2 font-medium w-28 whitespace-nowrap">Status</th>
                <th className="px-4 py-2 font-medium w-24">Priority</th>
                <th className="px-4 py-2 font-medium w-44">Progress</th>
                <th className="px-4 py-2 font-medium w-32 whitespace-nowrap">Start Date</th>
                <th className="px-4 py-2 font-medium w-32 whitespace-nowrap">Due Date</th>
                <th className="px-4 py-2 font-medium w-48 whitespace-nowrap">Project Owner</th>
                <th className="px-4 py-2 font-medium w-48">Dependency Task</th>
                <th className="px-4 py-2 font-medium w-64">Dependency Details</th>
                <th className="px-4 py-2 font-medium w-32 whitespace-nowrap">Dependency Status</th>
                <th className="px-4 py-2 font-medium w-40 whitespace-nowrap">Dependency Owner</th>
                <th className="px-4 py-2 font-medium w-72">Final Comments</th>
                <th className="px-4 py-2 font-medium w-16 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    {!canAddTask
                      ? 'Add at least one project owner before creating tasks.'
                      : tasks.length === 0
                        ? 'No tasks yet. Click "Add Task" to create the first one.'
                        : 'No tasks match your filters.'}
                  </td>
                </tr>
              ) : (
                pageRows.map(t => {
                  const overdue = isOverdue(t, today)
                  const displayStatus = overdue ? 'overdue' : t.status
                  const taskOwner = t.owner_id ? ownersById.get(t.owner_id) : null
                  const projectOwner = taskOwner?.user ?? null
                  return (
                    <tr key={t.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-white">{t.title}</p>
                        {t.category && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.category}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${statusStyle[displayStatus] ?? statusStyle.pending}`}>
                          {displayStatus === 'completed' && <CheckCircle2 size={11} />}
                          {displayStatus === 'in_progress' ? 'In Progress' :
                            displayStatus === 'overdue' ? 'Overdue' :
                            displayStatus === 'completed' ? 'Completed' : 'Pending'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-xs font-medium capitalize ${priorityStyle[t.priority]}`}>
                        {t.priority}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-600" style={{ width: `${t.progress}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 w-9 text-right">{t.progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {formatDate(t.start_date)}
                      </td>
                      <td className={`px-4 py-3 text-xs whitespace-nowrap ${overdue ? 'text-red-600 font-medium' : 'text-gray-600 dark:text-gray-300'}`}>
                        {formatDate(t.due_date)}
                      </td>
                      <td className="px-4 py-3">
                        {projectOwner ? (
                          <div className="flex items-center gap-2">
                            {projectOwner.avatar_url ? (
                              <img src={projectOwner.avatar_url} alt={projectOwner.full_name} className="w-6 h-6 rounded-full object-cover" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white text-[10px] font-bold flex items-center justify-center">
                                {initials(projectOwner.full_name)}
                              </div>
                            )}
                            <span className="text-xs text-gray-700 dark:text-gray-300">{projectOwner.full_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300">
                        {t.dependency_task ? t.dependency_task : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {t.dependency_details ? (
                          <p className="line-clamp-2 text-gray-700 dark:text-gray-300" title={t.dependency_details}>
                            {t.dependency_details}
                          </p>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {t.dependency_status ? (
                          <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                            {t.dependency_status}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {t.dependency_owner ? t.dependency_owner : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {t.final_comments ? (
                          <p className="line-clamp-2 text-gray-700 dark:text-gray-300" title={t.final_comments}>
                            {t.final_comments}
                          </p>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setEditingTask(t)}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                          title="Edit task"
                        >
                          <Pencil size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
            <p>
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Prev
              </button>
              <span className="px-2">Page {safePage} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {drawerOpen && (
        <AddProjectTaskDrawer
          projectId={project.id}
          owners={owners}
          defaultOwnerId={activeOwnerId !== 'all' ? activeOwnerId : (owners[0]?.id ?? null)}
          onClose={() => setDrawerOpen(false)}
          onCreated={() => { setDrawerOpen(false); router.refresh() }}
        />
      )}

      {editingTask && (
        <AddProjectTaskDrawer
          projectId={project.id}
          owners={owners}
          defaultOwnerId={editingTask.owner_id}
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onCreated={() => { setEditingTask(null); router.refresh() }}
        />
      )}
    </div>
  )
}
