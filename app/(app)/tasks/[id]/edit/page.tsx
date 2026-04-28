'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, GripVertical, CheckSquare, Lock, Link as LinkIcon, LayoutList, Download, FileUp } from 'lucide-react'
import Link from 'next/link'
import type { Task, SubTask, TaskType, Complexity, PointConfig, TaskDateChangeRequest } from '@/types'
import ScoringClassification from '@/components/tasks/ScoringClassification'
import DateChangeRequestForm from '@/components/tasks/DateChangeRequestForm'
import { computeScorePreview } from '@/lib/scoring'
import RichTextEditor from '@/components/notes/RichTextEditor'

const priorities = ['low', 'medium', 'high', 'critical']

interface TaskWithChildren extends Task {
  children?: Task[]
}

interface Profile {
  id: string
  full_name: string
  avatar_url: string | null
  designation: string | null
}

interface Props {
  params: Promise<{ id: string }>
}

function newSubTask(): SubTask {
  return { id: crypto.randomUUID(), title: '', completed: false, due_date: null }
}

function computePreview(configs: PointConfig[], taskType: TaskType | '', complexity: Complexity | '', subtaskCount = 0) {
  return computeScorePreview(configs, taskType, complexity, subtaskCount)
}

// ─── Dependency child card ───────────────────────────────────────────────────
interface DepCardProps {
  child: Task
  isAdmin: boolean
  configs: PointConfig[]
  profiles: Record<string, Profile>
}

function DependencyCard({ child, isAdmin, configs, profiles }: DepCardProps) {
  const [form, setForm] = useState({
    title: child.title ?? '',
    description: child.description ?? '',
    priority: child.priority ?? 'medium',
    task_type: (child.task_type ?? '') as TaskType | '',
    complexity: (child.complexity ?? '') as Complexity | '',
    start_date: child.start_date ?? '',
    due_date: child.due_date ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pendingReq, setPendingReq] = useState<TaskDateChangeRequest | null>(null)

  useEffect(() => {
    fetch(`/api/tasks/${child.id}/date-change-requests`)
      .then(r => r.ok ? r.json() : [])
      .then((reqs: TaskDateChangeRequest[]) => {
        setPendingReq(Array.isArray(reqs) ? (reqs.find(r => r.status === 'pending') ?? null) : null)
      })
      .catch(() => {})
  }, [child.id])

  function setF(k: string, v: string) { setForm(p => ({ ...p, [k]: v })) }

  // Scoring always locked for non-admins on dependency tasks (scoring_locked = true)
  const scoringLocked = !isAdmin || child.status === 'done'
  const childSubCount = (child.subtasks ?? []).filter(s => s.title.trim()).length
  const preview = computePreview(configs, form.task_type, form.complexity, childSubCount)
  const assignee = profiles[child.user_id]

  async function save() {
    setErr(null); setSaving(true)
    const payload: Record<string, unknown> = {
      title: form.title,
      description: form.description,
      priority: form.priority,
      task_type: form.task_type || undefined,
      complexity: form.complexity || undefined,
    }
    if (isAdmin) {
      payload.start_date = form.start_date || null
      payload.due_date = form.due_date || null
    }
    const res = await fetch(`/api/tasks/${child.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json(); setErr(d.error ?? 'Failed to save') }
    else { setSaved(true); setTimeout(() => setSaved(false), 2500) }
  }

  return (
    <div className="bg-white border border-purple-100 rounded-xl p-4 space-y-4 shadow-sm">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1 text-[10px] font-black bg-purple-100 text-purple-600 px-2 py-0.5 rounded uppercase tracking-tighter">
            <LinkIcon size={9} /> Dependency
          </span>
          {assignee && (
            <div className="flex items-center gap-1.5">
              {assignee.avatar_url
                ? <img src={assignee.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                : <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center"><span className="text-[9px] font-bold text-blue-600">{assignee.full_name.charAt(0)}</span></div>
              }
              <span className="text-xs font-medium text-gray-700">{assignee.full_name}</span>
              {assignee.designation && <span className="text-[10px] text-gray-400">· {assignee.designation}</span>}
            </div>
          )}
        </div>
        <Link href={`/tasks/${child.id}`} className="text-xs text-blue-500 hover:underline">
          View →
        </Link>
      </div>

      {/* Title */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Task Name <span className="text-red-400">*</span></label>
        <input type="text" value={form.title} onChange={e => setF('title', e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
        <RichTextEditor
          value={form.description}
          onChange={html => setF('description', html)}
          placeholder="Describe what needs to be done…"
        />
      </div>

      {/* Scoring — locked for non-admins; admin can edit if task not done */}
      <ScoringClassification
        configs={configs}
        taskType={form.task_type}
        complexity={form.complexity}
        onTypeChange={v => setF('task_type', v)}
        onComplexityChange={v => setF('complexity', v)}
        locked={scoringLocked}
        lockedReason={!isAdmin ? 'Weightage locked — only admin can change' : undefined}
        preview={preview}
        currentScore={child.score_weight}
      />

      {/* Dates */}
      <div>
        <div className="grid grid-cols-2 gap-3">
          {(['start_date', 'due_date'] as const).map(field => (
            <div key={field}>
              <label className="flex items-center gap-1 text-xs font-medium text-gray-600 mb-1">
                {field === 'start_date' ? 'Start Date' : 'Due Date'}
                {!isAdmin && <Lock size={10} className="text-gray-400" />}
              </label>
              <input type="date" value={form[field]} onChange={e => setF(field, e.target.value)} disabled={!isAdmin}
                className={`w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 ${
                  !isAdmin ? 'bg-gray-50 border-gray-200 text-gray-500 cursor-not-allowed' : 'border-gray-200'}`} />
            </div>
          ))}
        </div>
        {!isAdmin && (
          <div className="mt-2">
            {pendingReq ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800">
                <p className="font-medium">Date change pending admin review</p>
                <p className="mt-0.5 text-yellow-700">
                  Requested: {pendingReq.requested_start_date ?? '—'} → {pendingReq.requested_due_date ?? '—'}
                </p>
              </div>
            ) : (
              <DateChangeRequestForm
                taskId={child.id}
                currentStart={form.start_date || null}
                currentDue={form.due_date || null}
                onSubmitted={req => setPendingReq(req)}
              />
            )}
          </div>
        )}
      </div>

      {/* Priority */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
        <select value={form.priority} onChange={e => setF('priority', e.target.value)}
          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400">
          {priorities.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>
      </div>

      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

      <button type="button" onClick={save} disabled={saving}
        className="px-4 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Dependency'}
      </button>
    </div>
  )
}

// ─── Main edit page ──────────────────────────────────────────────────────────
export default function EditTaskPage({ params }: Props) {
  const { id } = use(params)
  const router = useRouter()

  const [task, setTask] = useState<TaskWithChildren | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configs, setConfigs] = useState<PointConfig[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [pendingDateRequest, setPendingDateRequest] = useState<TaskDateChangeRequest | null>(null)
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [form, setForm] = useState({
    title: '', description: '', category: '', priority: 'medium',
    task_type: '' as TaskType | '', complexity: '' as Complexity | '',
    start_date: '', due_date: '',
  })
  const [subtasks, setSubtasks] = useState<SubTask[]>([])
  const [subtaskDateErrors, setSubtaskDateErrors] = useState<Set<string>>(new Set())
  const [showBulk, setShowBulk] = useState(false)
  const [bulkTab, setBulkTab] = useState<'paste' | 'csv'>('paste')
  const [bulkText, setBulkText] = useState('')
  const [csvRows, setCsvRows] = useState<{ title: string; due_date: string | null }[]>([])
  const [csvFileName, setCsvFileName] = useState<string | null>(null)
  const [csvWarnings, setCsvWarnings] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/point-config').then(r => r.json()).then(d => Array.isArray(d) && setConfigs(d)).catch(() => {})
    fetch('/api/profile').then(r => r.json()).then(p => setIsAdmin(p?.role === 'admin')).catch(() => {})
    fetch('/api/users').then(r => r.json()).then((users: Profile[]) => {
      if (Array.isArray(users)) setProfiles(Object.fromEntries(users.map(u => [u.id, u])))
    }).catch(() => {})
    fetch('/api/categories').then(r => r.json()).then(d => Array.isArray(d) && setCategories(d)).catch(() => {})
  }, [])

  useEffect(() => {
    Promise.all([
      fetch(`/api/tasks/${id}`).then(r => r.json()),
      fetch(`/api/tasks/${id}/date-change-requests`).then(r => r.ok ? r.json() : []),
    ])
      .then(([data, requests]: [TaskWithChildren, TaskDateChangeRequest[]]) => {
        setTask(data)
        setForm({
          title: data.title ?? '', description: data.description ?? '',
          category: data.category ?? '', priority: data.priority ?? 'medium',
          task_type: (data.task_type as TaskType | null) ?? '',
          complexity: (data.complexity as Complexity | null) ?? '',
          start_date: data.start_date ?? '', due_date: data.due_date ?? '',
        })
        setSubtasks(data.subtasks ?? [])
        setPendingDateRequest(Array.isArray(requests) ? (requests.find(r => r.status === 'pending') ?? null) : null)
        setLoading(false)
      })
      .catch(() => { setError('Failed to load task'); setLoading(false) })
  }, [id])

  function setField(k: string, v: string) { setForm(p => ({ ...p, [k]: v })) }
  function addSubTask() { setSubtasks(p => [...p, newSubTask()]) }
  function updateSubTask(sid: string, t: string) { setSubtasks(p => p.map(s => s.id === sid ? { ...s, title: t } : s)) }
  function updateSubTaskDate(sid: string, date: string) {
    setSubtasks(p => p.map(s => s.id === sid ? { ...s, due_date: date || null } : s))
    if (date) setSubtaskDateErrors(prev => { const next = new Set(prev); next.delete(sid); return next })
  }
  function toggleSubTask(sid: string) { setSubtasks(p => p.map(s => s.id === sid ? { ...s, completed: !s.completed } : s)) }
  function removeSubTask(sid: string) { setSubtasks(p => p.filter(s => s.id !== sid)) }

  function parsePaste() {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) return
    setSubtasks(prev => [...prev, ...lines.map(title => ({ id: crypto.randomUUID(), title, completed: false, due_date: null }))])
    setBulkText(''); setShowBulk(false)
  }

  function parseCSVFile(file: File) {
    setCsvFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      const warnings: string[] = []
      const rows: { title: string; due_date: string | null }[] = []
      const start = lines[0]?.toLowerCase().startsWith('title') ? 1 : 0
      lines.slice(start).forEach((line, i) => {
        const [rawTitle, rawDate] = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
        if (!rawTitle) { warnings.push(`Row ${start + i + 1} skipped — empty title`); return }
        let due_date: string | null = null
        if (rawDate) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
            due_date = rawDate
          } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
            const [d, m, y] = rawDate.split('/')
            due_date = `${y}-${m}-${d}`
          } else {
            warnings.push(`Row ${start + i + 1}: unrecognised date "${rawDate}" — imported without date`)
          }
        }
        rows.push({ title: rawTitle, due_date })
      })
      setCsvRows(rows); setCsvWarnings(warnings)
    }
    reader.readAsText(file)
  }

  function importCSV() {
    if (!csvRows.length) return
    setSubtasks(prev => [...prev, ...csvRows.map(r => ({ id: crypto.randomUUID(), title: r.title, completed: false, due_date: r.due_date }))])
    setCsvRows([]); setCsvFileName(null); setCsvWarnings([]); setShowBulk(false)
  }

  function downloadTemplate() {
    const csv = ['title,due_date', 'Write social media copy,2026-05-08', 'Design banner image,', 'Get approval from manager,2026-05-06', 'Brief designer on visuals,2026-05-15', 'Add your own sub-tasks below,'].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'subtasks_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null)

    const validSubtasks = subtasks.filter(s => s.title.trim())
    const missingDates = new Set(validSubtasks.filter(s => !s.due_date).map(s => s.id))
    if (missingDates.size > 0) {
      setSubtaskDateErrors(missingDates)
      setError('Please set a due date for every sub-task.')
      return
    }
    setSubtaskDateErrors(new Set())
    setSaving(true)
    const payload: Record<string, unknown> = {
      title: form.title, description: form.description,
      category: form.category || undefined, priority: form.priority,
      task_type: form.task_type || undefined, complexity: form.complexity || undefined,
      subtasks: validSubtasks,
    }
    if (isAdmin) { payload.start_date = form.start_date || null; payload.due_date = form.due_date || null }
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json(); setError(d.error?.formErrors?.[0] ?? d.error ?? 'Failed to save'); return }
    router.push(`/tasks/${id}`); router.refresh()
  }

  const validSubtaskCount = subtasks.filter(s => s.title.trim()).length
  const preview = computePreview(configs, form.task_type, form.complexity, validSubtaskCount)
  const children = task?.children ?? []

  if (loading) return (
    <div className="max-w-2xl mx-auto">
      <div className="h-8 bg-gray-100 rounded-lg w-32 mb-5 animate-pulse" />
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
      </div>
    </div>
  )

  if (!task) return <div className="max-w-2xl mx-auto text-center py-20 text-gray-400">Task not found</div>

  if (task.approval_status === 'pending_approval') return (
    <div className="max-w-2xl mx-auto">
      <Link href={`/tasks/${id}`} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <ArrowLeft size={16} /> Back to Task
      </Link>
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
        <p className="text-gray-500">This task is awaiting completion approval and cannot be edited.</p>
        <Link href={`/tasks/${id}`} className="mt-4 inline-block text-sm text-blue-600 hover:underline">Back to task</Link>
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto">
      <Link href={`/tasks/${id}`} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <ArrowLeft size={16} /> Back to Task
      </Link>

      {/* ── Main task form ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Edit Task</h1>
        <form onSubmit={handleSubmit} className="space-y-5">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Task Name <span className="text-red-500">*</span></label>
            <input required type="text" value={form.title} onChange={e => setField('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <RichTextEditor
              value={form.description}
              onChange={html => setField('description', html)}
              placeholder="What needs to be done?"
            />
          </div>

          <ScoringClassification
            configs={configs} taskType={form.task_type} complexity={form.complexity}
            onTypeChange={v => setField('task_type', v)} onComplexityChange={v => setField('complexity', v)}
            locked={task.status === 'done' || (!isAdmin && task.scoring_locked)}
            lockedReason={!isAdmin && task.scoring_locked && task.status !== 'done' ? 'Set by admin' : undefined}
            preview={preview} currentScore={task.score_weight}
          />

          <div>
            <div className="grid grid-cols-2 gap-4">
              {(['start_date', 'due_date'] as const).map(field => (
                <div key={field}>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
                    {field === 'start_date' ? 'Start Date' : 'Due Date'}
                    {!isAdmin && <Lock size={11} className="text-gray-400" />}
                  </label>
                  <input type="date" value={form[field]} onChange={e => setField(field, e.target.value)} disabled={!isAdmin}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      !isAdmin ? 'bg-gray-50 border-gray-200 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`} />
                </div>
              ))}
            </div>
            {!isAdmin && (
              <div className="mt-3">
                {pendingDateRequest ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2.5 text-xs text-yellow-800">
                    <p className="font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
                      Date change request pending admin review
                    </p>
                    <p className="mt-1 text-yellow-700">
                      Requested: {pendingDateRequest.requested_start_date ?? '—'} → {pendingDateRequest.requested_due_date ?? '—'}
                    </p>
                    {pendingDateRequest.reason && <p className="mt-1 text-yellow-700 italic">"{pendingDateRequest.reason}"</p>}
                  </div>
                ) : (
                  <DateChangeRequestForm taskId={id} currentStart={form.start_date || null} currentDue={form.due_date || null}
                    onSubmitted={req => setPendingDateRequest(req)} />
                )}
              </div>
            )}
          </div>

          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckSquare size={16} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Sub-tasks / Checklist</span>
                {subtasks.length > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    {subtasks.filter(s => s.completed).length}/{subtasks.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => { setShowBulk(b => !b); setBulkTab('paste'); setBulkText(''); setCsvRows([]); setCsvFileName(null); setCsvWarnings([]) }}
                  className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
                  <LayoutList size={13} /> Bulk add
                </button>
                <button type="button" onClick={addSubTask}
                  className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                  <Plus size={14} /> Add item
                </button>
              </div>
            </div>

            {showBulk && (
              <div className="mb-3 border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex border-b border-gray-200 bg-gray-50">
                  {(['paste', 'csv'] as const).map(tab => (
                    <button key={tab} type="button" onClick={() => setBulkTab(tab)}
                      className={`px-4 py-2 text-xs font-medium transition-colors ${bulkTab === tab ? 'bg-white border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                      {tab === 'paste' ? 'Paste text' : 'Upload CSV'}
                    </button>
                  ))}
                </div>
                <div className="p-3 space-y-2">
                  {bulkTab === 'paste' && (
                    <>
                      <p className="text-xs text-gray-500">Paste one sub-task per line</p>
                      <textarea rows={5} value={bulkText} onChange={e => setBulkText(e.target.value)} autoFocus
                        placeholder={'Write social post\nSchedule Instagram story\nUpdate link in bio'}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={parsePaste} disabled={!bulkText.trim()}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                          + Add {bulkText.split('\n').filter(l => l.trim()).length || 0} items
                        </button>
                        <button type="button" onClick={() => setShowBulk(false)}
                          className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
                      </div>
                    </>
                  )}
                  {bulkTab === 'csv' && (
                    <>
                      <button type="button" onClick={downloadTemplate}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline mb-1">
                        <Download size={12} /> Download template
                      </button>
                      {!csvFileName ? (
                        <label className="block cursor-pointer">
                          <div className="border-2 border-dashed border-gray-200 rounded-xl py-8 flex flex-col items-center gap-2 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors">
                            <FileUp size={22} />
                            <span className="text-xs">Drop your CSV here, or click to browse</span>
                            <span className="text-xs text-gray-300">subtasks_template.csv format</span>
                          </div>
                          <input type="file" accept=".csv" className="hidden"
                            onChange={e => e.target.files?.[0] && parseCSVFile(e.target.files[0])} />
                        </label>
                      ) : (
                        <>
                          <div className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg">
                            <span>📄 {csvFileName}</span>
                            <button type="button" onClick={() => { setCsvFileName(null); setCsvRows([]); setCsvWarnings([]) }}
                              className="text-gray-400 hover:text-red-500 ml-2">✕</button>
                          </div>
                          {csvRows.length > 0 && (
                            <div className="border border-gray-100 rounded-lg overflow-hidden text-xs">
                              <div className="grid grid-cols-[1fr_auto] bg-gray-50 px-3 py-1.5 font-medium text-gray-500 uppercase tracking-wide">
                                <span>Title</span><span>Due Date</span>
                              </div>
                              {csvRows.map((r, i) => (
                                <div key={i} className="grid grid-cols-[1fr_auto] px-3 py-1.5 border-t border-gray-100">
                                  <span className="truncate text-gray-700">{r.title}</span>
                                  <span className="text-gray-400 pl-4">
                                    {r.due_date ? new Date(r.due_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          {csvWarnings.length > 0 && (
                            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                              ⚠ {csvWarnings.join(' · ')}
                            </p>
                          )}
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={importCSV} disabled={!csvRows.length}
                              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                              + Import {csvRows.length} items
                            </button>
                            <button type="button" onClick={() => setShowBulk(false)}
                              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {subtasks.length === 0 && !showBulk ? (
              <p className="text-xs text-gray-400 text-center py-3">No sub-tasks yet.</p>
            ) : (
              <div className="space-y-2">
                {subtasks.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2 group">
                    <GripVertical size={14} className="text-gray-300 flex-shrink-0" />
                    <button type="button" onClick={() => toggleSubTask(s.id)}
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${s.completed ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400'}`}>
                      {s.completed && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </button>
                    <span className="text-xs text-gray-400 w-5 flex-shrink-0">{i + 1}.</span>
                    <input type="text" value={s.title} onChange={e => updateSubTask(s.id, e.target.value)}
                      placeholder="Sub-task description"
                      className={`flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${s.completed ? 'line-through text-gray-400' : ''}`} />
                    <input type="date" value={s.due_date ?? ''} onChange={e => updateSubTaskDate(s.id, e.target.value)}
                      className={`w-32 px-2 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-2 text-gray-500 ${
                        subtaskDateErrors.has(s.id)
                          ? 'border-red-400 focus:ring-red-400'
                          : 'border-gray-200 focus:ring-blue-500'
                      }`} />
                    <button type="button" onClick={() => removeSubTask(s.id)}
                      className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-5 space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Additional Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select value={form.category} onChange={e => setField('category', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select value={form.priority} onChange={e => setField('priority', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {priorities.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <Link href={`/tasks/${id}`} className="px-6 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </Link>
          </div>
        </form>
      </div>

      {/* ── Linked dependency task cards ── */}
      {children.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <LinkIcon size={15} className="text-purple-500" />
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                Linked Dependencies <span className="text-purple-500">({children.length})</span>
              </h2>
            </div>
            {!isAdmin && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Lock size={10} /> Weightage &amp; dates are admin-only
              </p>
            )}
          </div>

          {children.map(child => (
            <DependencyCard key={child.id} child={child} isAdmin={isAdmin} configs={configs} profiles={profiles} />
          ))}
        </div>
      )}
    </div>
  )
}
