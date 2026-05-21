import type {
  AdminDigestTaskRow,
  AdminProjectDigestData,
  ProjectDigestOwnerSummary,
  ProjectDigestTask,
} from '@/lib/email'

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function addDays(yyyyMmDd: string, days: number): string {
  const d = new Date(yyyyMmDd + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function endOfWeekYmd(today: string): string {
  // Week ends Sunday. dow: Mon=1..Sun=7. UTC ok since strings are date-only.
  const d = new Date(today + 'T00:00:00Z')
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
  const remaining = 7 - dow
  return addDays(today, remaining)
}

export function buildAdminProjectDigest(args: {
  project: { id: string; name: string; start_date: string | null; end_date: string | null }
  owners: Array<{ id: string; user_id: string; department: string }>
  tasksByOwner: Record<string, ProjectDigestTask[]>
  profileById: Record<string, { full_name: string }>
  today: string
}): AdminProjectDigestData {
  const { project, owners, tasksByOwner, profileById, today } = args
  const tomorrow = addDays(today, 1)
  const weekEnd = endOfWeekYmd(today)

  const projectTasks: ProjectDigestTask[] = []
  const ownerOf: Record<string, { ownerName: string; department: string }> = {}
  const ownerSummaries: ProjectDigestOwnerSummary[] = []

  for (const owner of owners) {
    const ownerTasks = tasksByOwner[owner.id] ?? []
    const ownerName = profileById[owner.user_id]?.full_name ?? 'Owner'
    ownerOf[owner.id] = { ownerName, department: owner.department }

    let total = 0, completed = 0, in_progress = 0, pending = 0, overdue = 0
    for (const t of ownerTasks) {
      total += 1
      if (t.status === 'completed') completed += 1
      else if (t.status === 'in_progress') in_progress += 1
      else pending += 1
      if (t.status !== 'completed' && t.due_date && t.due_date < today) overdue += 1
      projectTasks.push(t)
    }
    ownerSummaries.push({
      ownerName,
      department: owner.department,
      total,
      completed,
      in_progress,
      pending,
      overdue,
      progressPct: total === 0 ? 0 : Math.round((completed / total) * 100),
    })
  }

  const total = projectTasks.length
  const completed = projectTasks.filter(t => t.status === 'completed').length
  const pending = total - completed
  const progressPct = total === 0 ? 0 : Math.round((completed / total) * 100)

  function toRow(t: ProjectDigestTask): AdminDigestTaskRow {
    const meta = t.owner_id ? ownerOf[t.owner_id] : undefined
    return {
      title: t.title,
      status: t.status,
      priority: t.priority,
      due_date: t.due_date,
      ownerName: meta?.ownerName ?? '—',
      department: meta?.department ?? '',
    }
  }

  const openTasks = projectTasks.filter(t => t.status !== 'completed')

  const dueToday = openTasks
    .filter(t => t.due_date === today)
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9))
    .map(toRow)

  const dueThisWeek = openTasks
    .filter(t => t.due_date && t.due_date >= tomorrow && t.due_date <= weekEnd)
    .sort((a, b) => {
      const ad = a.due_date ?? '9999'
      const bd = b.due_date ?? '9999'
      return ad.localeCompare(bd)
    })
    .map(toRow)

  // Top 5 pending: priority (Critical→Low) then due_date asc (nulls last)
  const topPending = [...openTasks]
    .sort((a, b) => {
      const ap = PRIORITY_RANK[a.priority] ?? 9
      const bp = PRIORITY_RANK[b.priority] ?? 9
      if (ap !== bp) return ap - bp
      const ad = a.due_date ?? '9999'
      const bd = b.due_date ?? '9999'
      return ad.localeCompare(bd)
    })
    .slice(0, 5)
    .map(toRow)

  return {
    id: project.id,
    name: project.name,
    startDate: project.start_date,
    endDate: project.end_date,
    total,
    completed,
    pending,
    progressPct,
    owners: ownerSummaries.sort((a, b) => a.department.localeCompare(b.department)),
    dueToday,
    dueThisWeek,
    topPending,
  }
}
