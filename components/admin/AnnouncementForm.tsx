'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, X } from 'lucide-react'
import RewardStrip from '@/components/announcements/RewardStrip'
import ScreenshotUploader, { type AttachmentRecord } from '@/components/announcements/ScreenshotUploader'

interface AwardType {
  id: string
  name: string
  icon: string
  bonus_points: number
}

interface MemberOption {
  id: string
  full_name: string
  department: string | null
}

interface InitialValues {
  id?: string
  title?: string
  description?: string | null
  target_mode?: 'department' | 'users'
  departments?: string[]
  user_ids?: string[]
  due_date?: string
  priority?: 'low' | 'medium' | 'high' | 'critical'
  task_type?: string | null
  complexity?: string | null
  category?: string | null
  award_type_id?: string | null
  bonus_points?: number
  score_weight?: number | null
}

interface Props {
  mode: 'create' | 'edit'
  initial?: InitialValues
  awards: AwardType[]
  departments: string[]                  // distinct values from profiles.department
  members: MemberOption[]                // active non-admin members for user-targeting
  taskTypes?: string[]
  complexities?: string[]
  categories?: string[]
  preloadedAttachments?: AttachmentRecord[]
}

const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const

export default function AnnouncementForm({
  mode, initial = {}, awards, departments, members, taskTypes = [], complexities = [], categories = [],
  preloadedAttachments,
}: Props) {
  const router = useRouter()
  const [title, setTitle] = useState(initial.title ?? '')
  const [description, setDescription] = useState(initial.description ?? '')
  const [targetMode, setTargetMode] = useState<'department' | 'users'>(initial.target_mode ?? 'department')
  const [selectedDepts, setSelectedDepts] = useState<string[]>(initial.departments ?? [])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(initial.user_ids ?? [])
  const [memberFilter, setMemberFilter] = useState('')
  const [dueDate, setDueDate] = useState(initial.due_date ?? '')
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>(initial.priority ?? 'medium')
  const [taskType, setTaskType] = useState(initial.task_type ?? '')
  const [complexity, setComplexity] = useState(initial.complexity ?? '')
  const [category, setCategory] = useState(initial.category ?? '')
  const [awardId, setAwardId] = useState<string>(initial.award_type_id ?? '')
  const [bonus, setBonus] = useState<number>(initial.bonus_points ?? 0)
  const [pointsMode, setPointsMode] = useState<'auto' | 'custom'>(
    initial.score_weight != null ? 'custom' : 'auto',
  )
  const [taskPoints, setTaskPoints] = useState<number>(initial.score_weight ?? 0)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Only used in edit mode (attachments need a parent id to upload against)
  const announcementId = initial.id

  const selectedAward = useMemo(() => awards.find(a => a.id === awardId) ?? null, [awards, awardId])

  // Auto-fill bonus from award default when changing award (only if user hasn't customized)
  useEffect(() => {
    if (!selectedAward) return
    setBonus(prev => prev === 0 ? selectedAward.bonus_points : prev)
  }, [selectedAward])

  function toggleDept(d: string) {
    setSelectedDepts(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  function toggleUser(uid: string) {
    setSelectedUserIds(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid])
  }

  const filteredMembers = useMemo(() => {
    const q = memberFilter.trim().toLowerCase()
    if (!q) return members
    return members.filter(m =>
      m.full_name.toLowerCase().includes(q)
      || (m.department ?? '').toLowerCase().includes(q),
    )
  }, [members, memberFilter])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) return setError('Title is required.')
    if (targetMode === 'department' && selectedDepts.length === 0) {
      return setError('Pick at least one department.')
    }
    if (targetMode === 'users' && selectedUserIds.length === 0) {
      return setError('Pick at least one user.')
    }
    if (!dueDate) return setError('Due date is required.')
    if (bonus > 0 && !awardId) {
      return setError('Pick an award type when bonus points are greater than 0.')
    }

    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        target_mode: targetMode,
        departments: targetMode === 'department' ? selectedDepts : [],
        user_ids: targetMode === 'users' ? selectedUserIds : [],
        due_date: dueDate,
        priority,
        task_type: taskType || undefined,
        complexity: complexity || undefined,
        category: category || undefined,
        award_type_id: awardId || null,
        bonus_points: bonus,
        score_weight: pointsMode === 'custom' ? taskPoints : null,
      }

      const url = mode === 'create' ? '/api/admin/announcements' : `/api/admin/announcements/${announcementId}`
      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Save failed (${res.status}).`)

      const id: string = mode === 'create' ? data.id : announcementId!
      router.push(`/admin/announcements/${id}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const totalPreview = (pointsMode === 'custom' ? taskPoints : 0) + bonus

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-800">
      <header className="flex items-center justify-between px-5 py-4">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">
          {mode === 'create' ? 'New Announcement' : 'Edit Announcement'}
        </h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <X size={14} /> Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-wait"
          >
            <Save size={14} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      {error && (
        <div className="px-5 py-3 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-sm">{error}</div>
      )}

      <section className="px-5 py-4 space-y-3">
        <Field label="Title *">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. Improve Edstellar blog category traffic"
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="What you're asking for, success criteria, context…"
          />
        </Field>

        <Field label="Target *">
          <div className="space-y-3">
            <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900 text-sm">
              <button
                type="button"
                onClick={() => setTargetMode('department')}
                className={`px-3 py-1.5 ${targetMode === 'department' ? 'bg-blue-600 text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
              >
                By Department
              </button>
              <button
                type="button"
                onClick={() => setTargetMode('users')}
                className={`px-3 py-1.5 ${targetMode === 'users' ? 'bg-blue-600 text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
              >
                By Specific Users
              </button>
            </div>

            {targetMode === 'department' ? (
              departments.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">No departments found on any active profile.</p>
              ) : (
                <>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Pick one or more departments. Anyone in those departments will see the announcement and can <em>request</em> to accept. You then approve finalists from the announcement detail page.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {departments.map(d => {
                      const active = selectedDepts.includes(d)
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleDept(d)}
                          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                            active
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'
                          }`}
                        >
                          {d}
                        </button>
                      )
                    })}
                  </div>
                </>
              )
            ) : (
              members.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">No active members to target.</p>
              ) : (
                <>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Pick one or more users. Only they will see the announcement, and each can accept directly — no admin approval gate. Bonus points are split equally among accepters.
                  </p>
                  <input
                    type="text"
                    value={memberFilter}
                    onChange={e => setMemberFilter(e.target.value)}
                    placeholder="Search members…"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="max-h-56 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                    {filteredMembers.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 text-center">No matches.</p>
                    ) : filteredMembers.map(m => {
                      const active = selectedUserIds.includes(m.id)
                      return (
                        <label
                          key={m.id}
                          className={`flex items-center justify-between gap-2 px-3 py-1.5 cursor-pointer ${active ? 'bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                        >
                          <span className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => toggleUser(m.id)}
                            />
                            <span className="text-gray-900 dark:text-white">{m.full_name}</span>
                          </span>
                          {m.department && (
                            <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{m.department}</span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                  {selectedUserIds.length > 0 && (
                    <p className="text-[11px] text-gray-600 dark:text-gray-300">
                      {selectedUserIds.length} user{selectedUserIds.length === 1 ? '' : 's'} selected.
                    </p>
                  )}
                </>
              )
            )}
          </div>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Due Date *">
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
          <Field label="Priority">
            <select
              value={priority}
              onChange={e => setPriority(e.target.value as typeof PRIORITIES[number])}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PRIORITIES.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
            </select>
          </Field>
          <Field label="Category">
            <CategoryInput value={category} onChange={setCategory} options={categories} />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Task Type">
            <ChoiceOrFree value={taskType} onChange={setTaskType} options={taskTypes} placeholder="e.g. Content" />
          </Field>
          <Field label="Complexity">
            <ChoiceOrFree value={complexity} onChange={setComplexity} options={complexities} placeholder="easy / medium / difficult" />
          </Field>
        </div>
      </section>

      {/* Reward section */}
      <section className="px-5 py-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Reward</h2>

        <Field label="Award type">
          <select
            value={awardId}
            onChange={e => setAwardId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— No award —</option>
            {awards.map(a => (
              <option key={a.id} value={a.id}>{a.icon} {a.name} (default {a.bonus_points} pts)</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Bonus points">
            <input
              type="number"
              min={0}
              value={bonus}
              onChange={e => setBonus(Number(e.target.value || 0))}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {selectedAward && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Award default: {selectedAward.bonus_points} pts</p>
            )}
          </Field>
          <Field label="Task points">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="pointsMode"
                  checked={pointsMode === 'auto'}
                  onChange={() => setPointsMode('auto')}
                />
                Auto
              </label>
              <label className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="pointsMode"
                  checked={pointsMode === 'custom'}
                  onChange={() => setPointsMode('custom')}
                />
                Custom
              </label>
              {pointsMode === 'custom' && (
                <input
                  type="number"
                  min={0}
                  value={taskPoints}
                  onChange={e => setTaskPoints(Number(e.target.value || 0))}
                  className="w-24 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              Auto = let task_type × complexity auto-calc score on accept.
            </p>
          </Field>
        </div>

        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Preview</p>
          <RewardStrip
            awardIcon={selectedAward?.icon ?? null}
            awardName={selectedAward?.name ?? null}
            taskPoints={pointsMode === 'custom' ? taskPoints : 0}
            bonusPoints={bonus}
            variant="hero"
            showAnimation={false}
          />
          {pointsMode === 'auto' && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              Task points will be set by the system when a member accepts (auto from task_type × complexity).
            </p>
          )}
        </div>
      </section>

      {/* Screenshots — only in edit mode (upload requires a parent id) */}
      {mode === 'edit' && announcementId && (
        <section className="px-5 py-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Reference screenshots</h2>
          <ScreenshotUploader
            uploadUrl={`/api/admin/announcements/${announcementId}/attachments`}
            deleteUrlFor={(attId) => `/api/admin/announcements/${announcementId}/attachments/${attId}`}
            initial={preloadedAttachments ?? []}
            maxFiles={5}
          />
        </section>
      )}

      {mode === 'create' && (
        <section className="px-5 py-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
            Screenshots can be added after saving — they need a saved announcement to attach to.
          </p>
        </section>
      )}
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1 inline-block">{label}</span>
      {children}
    </label>
  )
}

function ChoiceOrFree({
  value, onChange, options, placeholder,
}: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) {
  if (options.length === 0) {
    return (
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    )
  }
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="">— None —</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function CategoryInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  if (options.length === 0) {
    return (
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Optional"
        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    )
  }
  return <ChoiceOrFree value={value} onChange={onChange} options={options} />
}
