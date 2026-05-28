'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus, Search, Filter, ArrowLeft, TrendingUp, ListChecks, Loader2, AlertCircle, CheckCircle2, Calendar, Users, Pencil, Settings, Trash2, ChevronUp, ChevronDown, ArrowUpDown, FilterX,
} from 'lucide-react'
import AddProjectTaskDrawer from './AddProjectTaskDrawer'
import ProjectTeamPanel from './ProjectTeamPanel'
import ProjectSettingsModal from './ProjectSettingsModal'
import type { Project, ProjectTask, Profile, ProjectOwner } from '@/types'

interface Props {
  project: Project
  tasks: ProjectTask[]
  owners: ProjectOwner[]
  allMembers: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]
  isAdmin: boolean
}

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const

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

// Tasks that need urgent attention:
//   - status is in_progress and due date is today or in the past, OR
//   - status is pending (or anything other than completed) and due date is in the past
// Completed tasks never need attention.
function needsAttention(t: ProjectTask, today: string) {
  if (t.status === 'completed' || !t.due_date) return false
  if (t.status === 'in_progress') return t.due_date <= today
  return t.due_date < today
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

export default function ProjectDashboard({ project, tasks, owners, allMembers, isAdmin }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [activeOwnerId, setActiveOwnerId] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deletingBulk, setDeletingBulk] = useState(false)
  const [bulkSelectMenuOpen, setBulkSelectMenuOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'open' | 'completed' | 'all'>('open')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [teamOpen, setTeamOpen] = useState(owners.length === 0)

  const [sortBy, setSortBy] = useState<'start_date' | 'due_date' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [statusValues, setStatusValues] = useState<Set<string>>(new Set())
  const [priorityValues, setPriorityValues] = useState<Set<string>>(new Set())
  const [openHeaderFilter, setOpenHeaderFilter] = useState<'status' | 'priority' | null>(null)

  function toggleSort(col: 'start_date' | 'due_date') {
    if (sortBy !== col) { setSortBy(col); setSortDir('asc'); return }
    if (sortDir === 'asc') { setSortDir('desc'); return }
    setSortBy(null)
  }

  function toggleSetValue(setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) {
    setter(prev => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value); else next.add(value)
      return next
    })
  }

  const filtersActive = (
    search.trim() !== '' ||
    activeOwnerId !== 'all' ||
    statusFilter !== 'open' ||
    statusValues.size > 0 ||
    priorityValues.size > 0 ||
    sortBy !== null
  )

  function resetAllFilters() {
    setSearch('')
    setActiveOwnerId('all')
    setStatusFilter('open')
    setStatusValues(new Set())
    setPriorityValues(new Set())
    setSortBy(null)
    setSortDir('asc')
    setOpenHeaderFilter(null)
    setFiltersOpen(false)
    setPage(1)
  }

  const today = new Date().toISOString().slice(0, 10)
  const ownersById = useMemo(() => new Map(owners.map(o => [o.id, o])), [owners])
  const membersById = useMemo(() => new Map(allMembers.map(m => [m.id, m])), [allMembers])

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
      if (statusFilter === 'open' && t.status === 'completed') return false
      if (statusFilter === 'completed' && t.status !== 'completed') return false
      if (statusValues.size > 0) {
        const effective = isOverdue(t, today) ? 'overdue' : t.status
        if (!statusValues.has(effective)) return false
      }
      if (priorityValues.size > 0 && !priorityValues.has(t.priority)) return false
      return true
    })
  }, [tasks, activeOwnerId, search, statusFilter, statusValues, priorityValues, today])

  const attentionRows = useMemo(() => {
    return filtered
      .filter(t => needsAttention(t, today))
      .sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0
      })
  }, [filtered, today])

  const sortedRegularRows = useMemo(() => {
    const regular = filtered.filter(t => !needsAttention(t, today))
    if (!sortBy) return regular
    const dir = sortDir === 'asc' ? 1 : -1
    return [...regular].sort((a, b) => {
      const av = a[sortBy]
      const bv = b[sortBy]
      if (!av && !bv) return 0
      if (!av) return 1
      if (!bv) return -1
      return av < bv ? -dir : av > bv ? dir : 0
    })
  }, [filtered, sortBy, sortDir, today])

  const totalPages = Math.max(1, Math.ceil(sortedRegularRows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const regularPageRows = sortedRegularRows.slice((safePage - 1) * pageSize, safePage * pageSize)
  const pageRows = [...attentionRows, ...regularPageRows]

  const canAddTask = owners.length > 0

  function toggleRow(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAllFiltered() {
    const filteredIds = filtered.map(t => t.id)
    const allChecked = filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id))
    setSelectedIds(allChecked ? new Set() : new Set(filteredIds))
  }

  // Visible task order matches what the user sees: attention rows first,
  // then sorted regular rows. "Select first N" picks from this sequence
  // so the chunk the admin selects matches what's on screen.
  const orderedFilteredIds = useMemo(
    () => [...attentionRows, ...sortedRegularRows].map(t => t.id),
    [attentionRows, sortedRegularRows]
  )

  function selectFirstN(n: number | 'all') {
    const ids = n === 'all' ? orderedFilteredIds : orderedFilteredIds.slice(0, n)
    setSelectedIds(new Set(ids))
    setBulkSelectMenuOpen(false)
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return
    const n = selectedIds.size
    if (!confirm(`Permanently delete ${n} task${n === 1 ? '' : 's'}? This removes them from the database and cannot be undone.`)) return
    setDeletingBulk(true)
    const res = await fetch(`/api/projects/${project.id}/tasks/bulk-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    })
    setDeletingBulk(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(typeof data.error === 'string' ? data.error : 'Failed to delete selected tasks')
      return
    }
    setSelectedIds(new Set())
    router.refresh()
  }

  const filteredCount = filtered.length
  const allFilteredSelected = filteredCount > 0 && filtered.every(t => selectedIds.has(t.id))
  const someFilteredSelected = !allFilteredSelected && filtered.some(t => selectedIds.has(t.id))

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
          <div className="flex items-center gap-3 whitespace-nowrap">
            <div className="text-right text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Calendar size={14} />
              <span>{formatDate(project.start_date)} – {formatDate(project.end_date)}</span>
            </div>
            {isAdmin && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Project settings"
              >
                <Settings size={16} />
              </button>
            )}
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
              isAdmin={isAdmin}
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
            {filtersActive && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-800 transition-colors"
                title="Clear search, sort and all column filters"
              >
                <FilterX size={14} />
                Reset filters
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setFiltersOpen(o => !o)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg ${
                  statusFilter !== 'all'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <Filter size={14} />
                {statusFilter === 'open' ? 'Open' : statusFilter === 'completed' ? 'Completed' : 'All tasks'}
              </button>
              {filtersOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFiltersOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg p-1">
                    {([
                      { value: 'open', label: 'Open (not completed)' },
                      { value: 'completed', label: 'Completed only' },
                      { value: 'all', label: 'All tasks' },
                    ] as const).map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { setStatusFilter(opt.value); setFiltersOpen(false); setPage(1) }}
                        className={`w-full text-left px-3 py-1.5 text-sm rounded ${
                          statusFilter === opt.value
                            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
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

        {/* Bulk action bar */}
        {isAdmin && selectedIds.size > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 mt-3 mx-4 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900">
            <p className="text-sm text-blue-900 dark:text-blue-200">
              <strong>{selectedIds.size}</strong> selected
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1 text-xs text-blue-700 dark:text-blue-300 hover:underline"
              >
                Clear
              </button>
              <button
                onClick={deleteSelected}
                disabled={deletingBulk}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 size={13} />
                {deletingBulk ? 'Deleting…' : `Delete ${selectedIds.size} permanently`}
              </button>
            </div>
          </div>
        )}

        {/* Task table */}
        <div className="mt-3 overflow-x-auto">
          <table className="text-sm min-w-[2500px] w-full">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                {isAdmin && (
                  <th className="px-3 py-2 w-14 sticky left-0 z-20 bg-white dark:bg-gray-900">
                    <div className="flex items-center gap-1 relative">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        ref={el => { if (el) el.indeterminate = someFilteredSelected }}
                        onChange={toggleAllFiltered}
                        title={allFilteredSelected ? 'Deselect all' : 'Select all filtered tasks'}
                        className="rounded border-gray-300"
                      />
                      <button
                        type="button"
                        onClick={() => setBulkSelectMenuOpen(o => !o)}
                        className="p-0.5 text-gray-500 hover:text-blue-600"
                        title="Bulk select options"
                        aria-expanded={bulkSelectMenuOpen}
                      >
                        <ChevronDown size={12} />
                      </button>
                      {bulkSelectMenuOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-20"
                            onClick={() => setBulkSelectMenuOpen(false)}
                          />
                          <div className="absolute top-full left-0 mt-1 z-30 w-48 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
                            <button
                              type="button"
                              onClick={() => selectFirstN(50)}
                              disabled={filteredCount === 0}
                              className="w-full text-left px-3 py-1.5 text-xs normal-case tracking-normal text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Select first 50
                            </button>
                            <button
                              type="button"
                              onClick={() => selectFirstN(100)}
                              disabled={filteredCount === 0}
                              className="w-full text-left px-3 py-1.5 text-xs normal-case tracking-normal text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Select first 100
                            </button>
                            <button
                              type="button"
                              onClick={() => selectFirstN(250)}
                              disabled={filteredCount === 0}
                              className="w-full text-left px-3 py-1.5 text-xs normal-case tracking-normal text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Select first 250
                            </button>
                            <button
                              type="button"
                              onClick={() => selectFirstN('all')}
                              disabled={filteredCount === 0}
                              className="w-full text-left px-3 py-1.5 text-xs normal-case tracking-normal text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Select all ({filteredCount})
                            </button>
                            {selectedIds.size > 0 && (
                              <>
                                <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                                <button
                                  type="button"
                                  onClick={() => { setSelectedIds(new Set()); setBulkSelectMenuOpen(false) }}
                                  className="w-full text-left px-3 py-1.5 text-xs normal-case tracking-normal text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                  Clear selection
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </th>
                )}
                <th
                  className="px-4 py-2 font-medium w-64 sticky z-20 bg-white dark:bg-gray-900 shadow-[1px_0_0_0_rgb(229_231_235)] dark:shadow-[1px_0_0_0_rgb(31_41_55)]"
                  style={{ left: isAdmin ? 56 : 0 }}
                >
                  Task
                </th>
                <th className="px-4 py-2 font-medium w-28 whitespace-nowrap">
                  <ColumnFilter
                    label="Status"
                    options={[
                      { value: 'pending', label: 'Pending' },
                      { value: 'in_progress', label: 'In Progress' },
                      { value: 'completed', label: 'Completed' },
                      { value: 'overdue', label: 'Overdue' },
                    ]}
                    values={statusValues}
                    open={openHeaderFilter === 'status'}
                    onOpenChange={open => setOpenHeaderFilter(open ? 'status' : null)}
                    onToggle={v => toggleSetValue(setStatusValues, v)}
                    onClear={() => setStatusValues(new Set())}
                  />
                </th>
                <th className="px-4 py-2 font-medium w-24">
                  <ColumnFilter
                    label="Priority"
                    options={[
                      { value: 'critical', label: 'Critical' },
                      { value: 'high', label: 'High' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'low', label: 'Low' },
                    ]}
                    values={priorityValues}
                    open={openHeaderFilter === 'priority'}
                    onOpenChange={open => setOpenHeaderFilter(open ? 'priority' : null)}
                    onToggle={v => toggleSetValue(setPriorityValues, v)}
                    onClear={() => setPriorityValues(new Set())}
                  />
                </th>
                <th className="px-4 py-2 font-medium w-44">Progress</th>
                <th className="px-4 py-2 font-medium w-32 whitespace-nowrap">
                  <SortHeader label="Start Date" active={sortBy === 'start_date'} dir={sortDir} onClick={() => toggleSort('start_date')} />
                </th>
                <th className="px-4 py-2 font-medium w-32 whitespace-nowrap">
                  <SortHeader label="Due Date" active={sortBy === 'due_date'} dir={sortDir} onClick={() => toggleSort('due_date')} />
                </th>
                <th className="px-4 py-2 font-medium w-48 whitespace-nowrap">Project Owner</th>
                <th className="px-4 py-2 font-medium w-48">Dependency Task</th>
                <th className="px-4 py-2 font-medium w-40 whitespace-nowrap">Dependency Owner</th>
                <th className="px-4 py-2 font-medium w-32 whitespace-nowrap">Dependency Status</th>
                <th className="px-4 py-2 font-medium w-64">Dependency Details</th>
                <th className="px-4 py-2 font-medium w-72">Description</th>
                <th className="px-4 py-2 font-medium w-72">Final Comments</th>
                <th className="px-4 py-2 font-medium w-16 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 15 : 14} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
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
                  const attention = needsAttention(t, today)
                  const displayStatus = overdue ? 'overdue' : t.status
                  const taskOwner = t.owner_id ? ownersById.get(t.owner_id) : null
                  const projectOwner = taskOwner?.user ?? null
                  const rowBg = selectedIds.has(t.id)
                    ? 'bg-blue-50/40 dark:bg-blue-950/20'
                    : attention
                      ? 'bg-red-100 dark:bg-red-950/50'
                      : 'bg-white dark:bg-gray-900'
                  const rowHover = attention
                    ? 'hover:bg-red-200/80 dark:hover:bg-red-900/50'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  const groupHover = attention
                    ? 'group-hover:bg-red-200/80 dark:group-hover:bg-red-900/50'
                    : 'group-hover:bg-gray-50 dark:group-hover:bg-gray-800/50'
                  return (
                    <tr key={t.id} className={`group border-b border-gray-100 dark:border-gray-800 last:border-0 ${rowBg} ${rowHover}`}>
                      {isAdmin && (
                        <td className={`px-3 py-3 sticky left-0 z-10 ${rowBg} ${groupHover}`}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(t.id)}
                            onChange={() => toggleRow(t.id)}
                            className="rounded border-gray-300"
                          />
                        </td>
                      )}
                      <td
                        className={`px-4 py-3 sticky z-10 ${rowBg} ${groupHover} shadow-[1px_0_0_0_rgb(229_231_235)] dark:shadow-[1px_0_0_0_rgb(31_41_55)]`}
                        style={{ left: isAdmin ? 56 : 0 }}
                      >
                        <button
                          onClick={() => setEditingTask(t)}
                          className="text-left font-medium text-gray-900 dark:text-white hover:text-blue-600 hover:underline focus:outline-none focus:text-blue-600"
                          title="Click to edit"
                        >
                          {t.title}
                        </button>
                        {t.category && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.category}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[10px] px-2 py-0.5 rounded-full border ${statusStyle[displayStatus] ?? statusStyle.pending}`}>
                          {displayStatus === 'completed' && <CheckCircle2 size={10} />}
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
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {(() => {
                          const ids: string[] = (t.dependency_owner_ids && t.dependency_owner_ids.length > 0)
                            ? t.dependency_owner_ids
                            : (t.dependency_owner_id ? [t.dependency_owner_id] : [])
                          const deps = ids.map(id => membersById.get(id)).filter(Boolean) as Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]
                          if (deps.length > 0) {
                            return (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {deps.map(dep => (
                                  <span key={dep.id} className="inline-flex items-center gap-1.5 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full">
                                    {dep.avatar_url ? (
                                      <img src={dep.avatar_url} alt={dep.full_name} className="w-4 h-4 rounded-full object-cover" />
                                    ) : (
                                      <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white text-[8px] font-bold flex items-center justify-center">
                                        {initials(dep.full_name)}
                                      </div>
                                    )}
                                    <span className="text-gray-700 dark:text-gray-300">{dep.full_name}</span>
                                  </span>
                                ))}
                              </div>
                            )
                          }
                          if (t.dependency_owner) return <span className="text-gray-700 dark:text-gray-300">{t.dependency_owner}</span>
                          return <span className="text-gray-400">—</span>
                        })()}
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
                      <td className="px-4 py-3 text-xs">
                        {t.dependency_details ? (
                          <div
                            className="line-clamp-3 prose prose-sm max-w-none text-gray-700 dark:text-gray-300 dark:prose-invert"
                            dangerouslySetInnerHTML={{ __html: t.dependency_details }}
                          />
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {t.description ? (
                          <p className="line-clamp-3 text-gray-700 dark:text-gray-300 whitespace-pre-line">{t.description}</p>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {t.final_comments ? (
                          <div
                            className="line-clamp-3 prose prose-sm max-w-none text-gray-700 dark:text-gray-300 dark:prose-invert"
                            dangerouslySetInnerHTML={{ __html: t.final_comments }}
                          />
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
            <div className="flex items-center gap-3">
              <p>
                Showing {sortedRegularRows.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sortedRegularRows.length)} of {sortedRegularRows.length}
                {attentionRows.length > 0 && (
                  <span className="ml-2 text-red-600 dark:text-red-400">
                    · {attentionRows.length} pinned (needs attention)
                  </span>
                )}
              </p>
              <label className="flex items-center gap-1.5">
                <span>Rows per page</span>
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                  className="px-1.5 py-0.5 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
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
          allMembers={allMembers}
          isAdmin={isAdmin}
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
          allMembers={allMembers}
          isAdmin={isAdmin}
          onClose={() => setEditingTask(null)}
          onCreated={() => { setEditingTask(null); router.refresh() }}
        />
      )}

      {settingsOpen && (
        <ProjectSettingsModal
          project={project}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}

function SortHeader({
  label, active, dir, onClick,
}: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-blue-600 transition-colors ${active ? 'text-blue-600' : ''}`}
      title={active ? `Sorted ${dir === 'asc' ? 'ascending' : 'descending'} — click to toggle` : 'Sort'}
    >
      <span>{label}</span>
      {active ? (
        dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
      ) : (
        <ArrowUpDown size={12} className="opacity-50" />
      )}
    </button>
  )
}

interface ColumnFilterOption { value: string; label: string }
function ColumnFilter({
  label, options, values, open, onOpenChange, onToggle, onClear,
}: {
  label: string
  options: ColumnFilterOption[]
  values: Set<string>
  open: boolean
  onOpenChange: (open: boolean) => void
  onToggle: (value: string) => void
  onClear: () => void
}) {
  const active = values.size > 0
  return (
    <span className="relative inline-flex items-center gap-1">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={`p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${active ? 'text-blue-600' : 'opacity-60 hover:opacity-100'}`}
        title="Filter"
      >
        <Filter size={12} />
      </button>
      {active && (
        <span className="ml-0.5 text-[10px] font-semibold text-blue-600 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-full px-1.5">
          {values.size}
        </span>
      )}
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => onOpenChange(false)} />
          <div className="absolute top-full left-0 mt-1 z-40 w-52 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg p-1.5 normal-case tracking-normal">
            <div className="max-h-64 overflow-y-auto">
              {options.length === 0 ? (
                <p className="px-2 py-2 text-xs text-gray-500 dark:text-gray-400">No options.</p>
              ) : options.map(opt => {
                const checked = values.has(opt.value)
                return (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm font-normal text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(opt.value)}
                      className="rounded border-gray-300"
                    />
                    <span className="truncate">{opt.label}</span>
                  </label>
                )
              })}
            </div>
            {active && (
              <div className="border-t border-gray-100 dark:border-gray-800 pt-1 mt-1">
                <button
                  type="button"
                  onClick={onClear}
                  className="w-full text-left text-xs px-2 py-1 text-blue-600 hover:underline"
                >
                  Clear filter
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </span>
  )
}
