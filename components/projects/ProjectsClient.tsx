'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, FolderKanban, Calendar, ListChecks } from 'lucide-react'
import CreateProjectModal from './CreateProjectModal'
import type { Project } from '@/types'

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

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function progress(s?: ProjectStats) {
  if (!s || s.total === 0) return 0
  return Math.round((s.completed / s.total) * 100)
}

export default function ProjectsClient({ projects, stats, isAdmin }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Projects</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {projects.length} project{projects.length === 1 ? '' : 's'}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(project => {
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
                  <span className={
                    'text-xs px-2 py-0.5 rounded-full font-medium ' +
                    (project.status === 'active' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : project.status === 'completed' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                      : project.status === 'on_hold' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400')
                  }>
                    {project.status.replace('_', ' ')}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">
                  {project.name}
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
      )}

      {open && <CreateProjectModal onClose={() => setOpen(false)} />}
    </div>
  )
}
