'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, GripVertical, CheckSquare, Link as LinkIcon, User, Calendar, LayoutList, Download, FileUp, NotebookPen, X } from 'lucide-react'
import Link from 'next/link'
import TaskSuggestionPanel from '@/components/ai/TaskSuggestionPanel'
import ScoringClassification from '@/components/tasks/ScoringClassification'
import { computeScorePreview } from '@/lib/scoring'
import type { SubTask, TaskType, Complexity, PointConfig, Priority } from '@/types'

interface UserOption {
  id: string
  full_name: string
  avatar_url: string | null
  designation: string | null
  role: string
}

const priorities = ['low', 'medium', 'high', 'critical']

interface DependencyTask {
  id: string
  title: string
  description: string
  user_id: string
  task_type: TaskType
  complexity: Complexity
  priority: Priority
  due_date: string
}

function newSubTask(): SubTask {
  return { id: crypto.randomUUID(), title: '', completed: false, due_date: null }
}

function newDependency(): DependencyTask {
  return {
    id: crypto.randomUUID(),
    title: '',
    description: '',
    user_id: '',
    task_type: '' as TaskType,
    complexity: '' as Complexity,
    priority: 'medium',
    due_date: ''
  }
}

function computePreview(configs: PointConfig[], taskType: TaskType | '', complexity: Complexity | '', subtaskCount = 0) {
  return computeScorePreview(configs, taskType, complexity, subtaskCount)
}

function validateSubtaskDateRange(subtaskDate: string, taskStartDate: string, taskDueDate: string): string | null {
  if (taskStartDate && subtaskDate < taskStartDate) return 'Before task start date'
  if (taskDueDate && subtaskDate > taskDueDate) return 'After task due date'
  return null
}

export default function NewTaskPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configs, setConfigs] = useState<PointConfig[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [prefillBanner, setPrefillBanner] = useState<string | null>(null)

  const now = new Date()

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    priority: 'medium',
    task_type: '' as TaskType | '',
    complexity: '' as Complexity | '',
    start_date: '',
    due_date: '',
  })

  const [subtasks, setSubtasks] = useState<SubTask[]>([])
  const [subtaskDateErrors, setSubtaskDateErrors] = useState<Set<string>>(new Set())
  const [subtaskDateRangeErrors, setSubtaskDateRangeErrors] = useState<Map<string, string>>(new Map())
  const [showBulk, setShowBulk] = useState(false)
  const [bulkTab, setBulkTab] = useState<'paste' | 'csv'>('paste')
  const [bulkText, setBulkText] = useState('')
  const [csvRows, setCsvRows] = useState<{ title: string; due_date: string | null }[]>([])
  const [csvFileName, setCsvFileName] = useState<string | null>(null)
  const [csvWarnings, setCsvWarnings] = useState<string[]>([])
  const [dependencies, setDependencies] = useState<DependencyTask[]>([])

  useEffect(() => {
    fetch('/api/point-config')
      .then(r => r.json())
      .then(d => Array.isArray(d) && setConfigs(d))
      .catch(() => {})

    fetch('/api/users')
      .then(r => r.json())
      .then(d => Array.isArray(d) && setUsers(d))
      .catch(() => {})

    fetch('/api/categories')
      .then(r => r.json())
      .then(d => Array.isArray(d) && setCategories(d))
      .catch(() => {})
  }, [])

  // Pre-fill from a meeting note when ?from_note=<id> is present
  useEffect(() => {
    const noteId = searchParams.get('from_note')
    if (!noteId) return

    fetch(`/api/notes/${noteId}`)
      .then(r => r.ok ? r.json() : null)
      .then(note => {
        if (!note) return

        // Build description: goal first, then body if present
        const description = note.body
          ? `${note.goal}\n\n${note.body}`
          : note.goal

        // First timeline entry that has a date becomes the due date
        const firstDatedTimeline = (note.timelines ?? []).find((t: { date?: string | null }) => t.date)

        setForm(prev => ({
          ...prev,
          title:      note.title,
          description,
          start_date: note.meeting_date,
          due_date:   firstDatedTimeline?.date ?? '',
        }))

        // Map remaining timelines (that have labels) to subtasks
        const timelineSubtasks: SubTask[] = (note.timelines ?? [])
          .filter((t: { label: string }) => t.label?.trim())
          .map((t: { label: string; date?: string | null }) => ({
            id:        crypto.randomUUID(),
            title:     t.label,
            completed: false,
            due_date:  t.date ?? null,
          }))
        if (timelineSubtasks.length > 0) setSubtasks(timelineSubtasks)

        setPrefillBanner(`Pre-filled from meeting note: "${note.title}"`)
      })
      .catch(() => {})
  }, [searchParams])

  function setField(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (key === 'start_date' || key === 'due_date') {
      const newStart = key === 'start_date' ? value : form.start_date
      const newDue = key === 'due_date' ? value : form.due_date
      setSubtaskDateRangeErrors(() => {
        const next = new Map<string, string>()
        subtasks.forEach(s => {
          if (s.due_date) {
            const err = validateSubtaskDateRange(s.due_date, newStart, newDue)
            if (err) next.set(s.id, err)
          }
        })
        return next
      })
    }
  }

  function addSubTask() { setSubtasks(prev => [...prev, newSubTask()]) }
  function updateSubTask(id: string, title: string) { setSubtasks(prev => prev.map(s => s.id === id ? { ...s, title } : s)) }
  function updateSubTaskDate(id: string, date: string) {
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, due_date: date || null } : s))
    setSubtaskDateErrors(prev => { const next = new Set(prev); if (date) next.delete(id); return next })
    setSubtaskDateRangeErrors(prev => {
      const next = new Map(prev)
      if (date) {
        const err = validateSubtaskDateRange(date, form.start_date, form.due_date)
        if (err) next.set(id, err)
        else next.delete(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }
  function removeSubTask(id: string) {
    setSubtasks(prev => prev.filter(s => s.id !== id))
    setSubtaskDateRangeErrors(prev => { const next = new Map(prev); next.delete(id); return next })
  }

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
    const newSubtasks = csvRows.map(r => ({ id: crypto.randomUUID(), title: r.title, completed: false, due_date: r.due_date }))
    setSubtasks(prev => [...prev, ...newSubtasks])
    setSubtaskDateRangeErrors(prev => {
      const next = new Map(prev)
      newSubtasks.forEach(s => {
        if (s.due_date) {
          const err = validateSubtaskDateRange(s.due_date, form.start_date, form.due_date)
          if (err) next.set(s.id, err)
          else next.delete(s.id)
        }
      })
      return next
    })
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

  function addDependency() { setDependencies(prev => [...prev, newDependency()]) }
  function updateDependency(id: string, updates: Partial<DependencyTask>) {
    setDependencies(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d))
  }
  function removeDependency(id: string) { setDependencies(prev => prev.filter(d => d.id !== id)) }

  function importSuggestion(s: { title: string; description: string; category: string; priority: string; task_type?: string; complexity?: string }) {
    setForm(prev => ({
      ...prev,
      title: s.title,
      description: s.description,
      category: s.category,
      priority: s.priority,
      task_type: (s.task_type as TaskType | undefined) ?? prev.task_type,
      complexity: (s.complexity as Complexity | undefined) ?? prev.complexity,
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validSubtasks = subtasks.filter(s => s.title.trim())
    const missingDates = new Set(validSubtasks.filter(s => !s.due_date).map(s => s.id))
    if (missingDates.size > 0) {
      setSubtaskDateErrors(missingDates)
      setError('Please set a due date for every sub-task.')
      return
    }
    setSubtaskDateErrors(new Set())

    const rangeErrors = new Map<string, string>()
    validSubtasks.forEach(s => {
      if (s.due_date) {
        const err = validateSubtaskDateRange(s.due_date, form.start_date, form.due_date)
        if (err) rangeErrors.set(s.id, err)
      }
    })
    if (rangeErrors.size > 0) {
      setSubtaskDateRangeErrors(rangeErrors)
      setError('Sub-task due dates must fall within the task\'s start and due date.')
      return
    }
    setSubtaskDateRangeErrors(new Map())
    setLoading(true)
    const validDeps = dependencies.filter(d => d.title.trim() && d.user_id)

    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        task_type: form.task_type || undefined,
        complexity: form.complexity || undefined,
        start_date: form.start_date || undefined,
        due_date: form.due_date || undefined,
        category: form.category || undefined,
        subtasks: validSubtasks.length > 0 ? validSubtasks : undefined,
        dependencies: validDeps.length > 0 ? validDeps.map(({ id: _id, ...rest }) => ({
          ...rest,
          description: rest.description || undefined,
          due_date: rest.due_date || form.due_date || undefined,
        })) : undefined,
      }),
    })

    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error?.formErrors?.[0] ?? data.error ?? 'Failed to create task')
      return
    }
    router.push('/tasks')
    router.refresh()
  }

  const validSubtaskCount = subtasks.filter(s => s.title.trim()).length
  const preview = computePreview(configs, form.task_type, form.complexity, validSubtaskCount)

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/tasks" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <ArrowLeft size={16} /> Back to Tasks
      </Link>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Create New Task</h1>

        {prefillBanner && (
          <div className="flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2.5 mb-5 -mt-2">
            <div className="flex items-center gap-2 text-sm text-indigo-700">
              <NotebookPen size={14} className="flex-shrink-0" />
              {prefillBanner}
            </div>
            <button
              type="button"
              onClick={() => setPrefillBanner(null)}
              className="text-indigo-400 hover:text-indigo-600 flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <TaskSuggestionPanel
            month={now.getMonth() + 1}
            year={now.getFullYear()}
            onImport={importSuggestion}
          />

          {/* Task name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Task Name <span className="text-red-500">*</span></label>
            <input
              required
              type="text"
              value={form.title}
              onChange={e => setField('title', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter task name"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={e => setField('description', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="What needs to be done?"
            />
          </div>

          {/* Scoring Classification */}
          <ScoringClassification
            configs={configs}
            taskType={form.task_type}
            complexity={form.complexity}
            onTypeChange={v => setField('task_type', v)}
            onComplexityChange={v => setField('complexity', v)}
            preview={preview}
          />

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => setField('start_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => setField('due_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Sub-tasks */}
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckSquare size={16} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Sub-tasks / Checklist</span>
                {subtasks.length > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{subtasks.length}</span>
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
              <p className="text-xs text-gray-400 text-center py-3">No sub-tasks added yet.</p>
            ) : (
              <div className="space-y-2">
                {subtasks.map((s, i) => (
                  <div key={s.id} className="flex items-start gap-2 group">
                    <GripVertical size={14} className="text-gray-300 flex-shrink-0 mt-2" />
                    <span className="text-xs text-gray-400 w-5 flex-shrink-0 mt-2">{i + 1}.</span>
                    <input
                      type="text"
                      value={s.title}
                      onChange={e => updateSubTask(s.id, e.target.value)}
                      placeholder="Sub-task description"
                      className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex flex-col flex-shrink-0">
                      <input
                        type="date"
                        value={s.due_date ?? ''}
                        onChange={e => updateSubTaskDate(s.id, e.target.value)}
                        className={`w-32 px-2 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-2 text-gray-500 ${
                          subtaskDateErrors.has(s.id) || subtaskDateRangeErrors.has(s.id)
                            ? 'border-red-400 focus:ring-red-400'
                            : 'border-gray-200 focus:ring-blue-500'
                        }`}
                      />
                      {subtaskDateRangeErrors.has(s.id) && (
                        <span className="text-[10px] text-red-500 mt-0.5 leading-tight">
                          {subtaskDateRangeErrors.get(s.id)}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSubTask(s.id)}
                      className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 mt-0.5"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dependencies */}
          <div className="border border-purple-100 bg-purple-50/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-purple-700">
                <LinkIcon size={16} />
                <span className="text-sm font-bold uppercase tracking-tight">Linked Dependencies</span>
                {dependencies.length > 0 && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{dependencies.length}</span>
                )}
              </div>
              <button
                type="button"
                onClick={addDependency}
                className="flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:text-purple-700 px-2 py-1 rounded-lg hover:bg-purple-100 transition-colors"
              >
                <Plus size={14} /> Assign Dependency
              </button>
            </div>

            {dependencies.length === 0 ? (
              <p className="text-xs text-purple-400/60 text-center py-3">No dependencies assigned yet. These tasks must be approved before you can close this task.</p>
            ) : (
              <div className="space-y-4">
                {dependencies.map((d, i) => {
                  const dp = computePreview(configs, d.task_type, d.complexity)
                  return (
                    <div key={d.id} className="bg-white border border-purple-100 rounded-xl p-4 shadow-sm space-y-3 relative group">
                      <button
                        type="button"
                        onClick={() => removeDependency(d.id)}
                        className="absolute top-2 right-2 p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                      
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-purple-300 uppercase">#{i + 1} Dependency</span>
                      </div>

                      <input
                        required
                        type="text"
                        value={d.title}
                        onChange={e => updateDependency(d.id, { title: e.target.value })}
                        placeholder="What needs to be done by someone else?"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                      />

                      <textarea
                        rows={3}
                        value={d.description}
                        onChange={e => updateDependency(d.id, { description: e.target.value })}
                        placeholder="Detailed description — context, requirements, acceptance criteria…"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                      />

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                            <User size={10} /> Assign To
                          </label>
                          <select
                            required
                            value={d.user_id}
                            onChange={e => updateDependency(d.id, { user_id: e.target.value })}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                          >
                            <option value="">Select team member</option>
                            {users.map(u => (
                              <option key={u.id} value={u.id}>
                                {u.full_name}{u.designation ? ` — ${u.designation}` : ''} ({u.role})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                            <Calendar size={10} /> Due Date
                          </label>
                          <input
                            type="date"
                            value={d.due_date}
                            onChange={e => updateDependency(d.id, { due_date: e.target.value })}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 outline-none"
                          />
                        </div>
                      </div>

                      <ScoringClassification
                        configs={configs}
                        taskType={d.task_type}
                        complexity={d.complexity}
                        onTypeChange={v => updateDependency(d.id, { task_type: v as TaskType })}
                        onComplexityChange={v => updateDependency(d.id, { complexity: v as Complexity })}
                        preview={dp}
                      />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Category + Priority */}
          <div className="border-t border-gray-100 pt-5 space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Additional Details</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={e => setField('category', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select category</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={form.priority}
                  onChange={e => setField('priority', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {priorities.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating…' : 'Create Task'}
            </button>
            <Link href="/tasks" className="px-6 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
