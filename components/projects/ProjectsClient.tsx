'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, FolderKanban, Calendar, ListChecks, Search, LayoutGrid, List as ListIcon, ChevronLeft, ChevronRight, X } from 'lucide-react'
import CreateProjectModal from './CreateProjectModal'
import { formatProjectName } from '@/lib/utils'
import { PROJECT_DOMAINS, type Project } from '@/types'

interface ProjectStats {
  total: number
  completed: number
  in_progress: number
  pending: number
  overdue: number
}

interface Props {
  projects: Project[]
  stats: Record<string, ProjectStats>
  isAdmin: boolean
}

type ViewMode = 'cards' | 'list'
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function progress(s?: ProjectStats) {
  if (!s || s.total === 0) return 0
  return Math.round((s.completed / s.total) * 100)
}

function statusPillClass(status: Project['status']) {
  switch (status) {
    case 'active':    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
    case 'completed': return 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
    case 'on_hold':   return 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
    default:          return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  }
}

export default function ProjectsClient({ projects, stats, isAdmin }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [domainFilter, setDomainFilter] = useState<'all' | 'none' | Project['domain']>('all')
  const [view, setView] = useState<ViewMode>('cards')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projects.filter(p => {
      if (domainFilter === 'none' && p.domain) return false
      if (domainFilter !== 'all' && domainFilter !== 'none' && p.domain !== domainFilter) return false
      if (q) {
        const hay = `${p.domain ?? ''} ${p.name} ${p.description ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [projects, search, domainFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageRows = filtered.slice(pageStart, pageStart + pageSize)

  // When filters change, snap back to page 1 if the current page is empty.
  // (Cheap to recompute; runs only when filtered.length changes.)
  if (safePage !== page) {
    // Defer to next render to avoid setState during render.
    queueMicrotask(() => setPage(safePage))
  }

  const hasFilters = search.trim().length > 0 || domainFilter !== 'all'

  function clearFilters() {
    setSearch('')
    setDomainFilter('all')
    setPage(1)
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Projects</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {filtered.length === projects.length
              ? `${projects.length} project${projects.length === 1 ? '' : 's'}`
              : `${filtered.length} of ${projects.length} project${projects.length === 1 ? '' : 's'}`}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            New Project
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-12 text-center">
          <FolderKanban size={36} className="mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 dark:text-gray-300 font-medium">{isAdmin ? 'No projects yet' : 'No projects assigned to you yet'}</p>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin
              ? 'Create your first project to organize tasks by initiative.'
              : 'Once an admin assigns you to a project, it will show up here.'}
          </p>
          {isAdmin && (
            <button
              onClick={() => setOpen(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              <Plus size={16} />
              New Project
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Toolbar: search + domain filter + view toggle */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search name or description…"
                className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={domainFilter ?? 'all'}
              onChange={e => { setDomainFilter(e.target.value as typeof domainFilter); setPage(1) }}
              className="px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Filter by domain"
            >
              <option value="all">All domains</option>
              {PROJECT_DOMAINS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
              <option value="none">No domain</option>
            </select>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2.5 py-2 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                title="Clear filters"
              >
                <X size={12} />
                Clear
              </button>
            )}
            <div className="ml-auto inline-flex border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
              <button
                onClick={() => setView('cards')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs ${view === 'cards' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                title="Card view"
              >
                <LayoutGrid size={13} />
                Cards
              </button>
              <button
                onClick={() => setView('list')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs border-l border-gray-200 dark:border-gray-800 ${view === 'list' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                title="List view"
              >
                <ListIcon size={13} />
                List
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-10 text-center">
              <p className="text-gray-600 dark:text-gray-300 font-medium">No projects match your filters.</p>
              <button
                onClick={clearFilters}
                className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-xs text-blue-700 dark:text-blue-300 hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : view === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pageRows.map(project => {
                const s = stats[project.id]
                const pct = progress(s)
                return (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-blue-600">
                        <FolderKanban size={20} />
                      </div>
                      <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + statusPillClass(project.status)}>
                        {project.status.replace('_', ' ')}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">
                      {formatProjectName(project)}
                    </h3>
                    {project.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{project.description}</p>
                    )}

                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                        <span>Progress</span>
                        <span className="font-medium text-gray-900 dark:text-white">{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <ListChecks size={13} />
                        {s?.total ?? 0} tasks
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar size={13} />
                        {formatDate(project.start_date)} – {formatDate(project.end_date)}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
                      <th className="px-4 py-2 font-medium">Project</th>
                      <th className="px-4 py-2 font-medium w-24">Domain</th>
                      <th className="px-4 py-2 font-medium w-28">Status</th>
                      <th className="px-4 py-2 font-medium w-40">Progress</th>
                      <th className="px-4 py-2 font-medium w-20 text-right">Tasks</th>
                      <th className="px-4 py-2 font-medium w-20 text-right">Overdue</th>
                      <th className="px-4 py-2 font-medium w-56">Dates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map(project => {
                      const s = stats[project.id]
                      const pct = progress(s)
                      return (
                        <tr key={project.id} className="border-b last:border-b-0 border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-950">
                          <td className="px-4 py-2.5">
                            <Link href={`/projects/${project.id}`} className="font-medium text-gray-900 dark:text-white hover:text-blue-600">
                              {formatProjectName(project)}
                            </Link>
                            {project.description && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">{project.description}</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-gray-300">
                            {project.domain ?? '—'}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={'text-xs px-2 py-0.5 rounded-full font-medium ' + statusPillClass(project.status)}>
                              {project.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs font-medium text-gray-900 dark:text-white w-10 text-right">{pct}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-200">{s?.total ?? 0}</td>
                          <td className="px-4 py-2.5 text-right">
                            {s?.overdue ? (
                              <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 rounded">{s.overdue}</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap">
                            {formatDate(project.start_date)} – {formatDate(project.end_date)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between flex-wrap gap-3 text-sm">
              <div className="flex items-center gap-3">
                <p className="text-gray-600 dark:text-gray-300">
                  Showing {pageStart + 1}–{Math.min(pageStart + pageSize, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500 dark:text-gray-400">Rows per page</label>
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                    className="px-2 py-1 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded"
                  >
                    {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-800 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <ChevronLeft size={13} />
                  Prev
                </button>
                <span className="text-xs text-gray-600 dark:text-gray-300">Page {safePage} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-800 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Next
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {open && <CreateProjectModal onClose={() => setOpen(false)} />}
    </div>
  )
}
