'use client'

import { useState } from 'react'
import { Save, RotateCcw, Zap, RefreshCw, Plus, Trash2, AlertTriangle, X } from 'lucide-react'
import type { PointConfig } from '@/types'

interface Props {
  initialConfigs: PointConfig[]
}

const DEFAULT_ICONS: Record<string, string> = {
  task_type_monthly_task: '🔁',
  task_type_new_implementation: '🚀',
  task_type_ai: '🤖',
  complexity_easy: '🟢',
  complexity_medium: '🟡',
  complexity_difficult: '🔴',
}

function getIcon(c: PointConfig): string {
  // Built-in types always use hardcoded emoji (description holds real text for them)
  if (DEFAULT_ICONS[c.config_key]) return DEFAULT_ICONS[c.config_key]
  // Custom types: admin-provided emoji lives in description (short string)
  if (c.description && c.description.trim().length <= 4) return c.description.trim()
  return c.category === 'task_type' ? '📋' : '🔵'
}

function getHelperText(c: PointConfig): string | null {
  // Built-ins have real text in description; custom types have emoji (skip)
  if (DEFAULT_ICONS[c.config_key]) return c.description ?? null
  return null
}

function toSlug(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

interface DeleteConfirmProps {
  configKey: string
  label: string
  category: string
  isBuiltIn: boolean
  onConfirm: () => void
  onCancel: () => void
}

function DeleteConfirmModal({ configKey, label, category, isBuiltIn, onConfirm, onCancel }: DeleteConfirmProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Delete &quot;{label}&quot;?</h3>
            <p className="text-sm text-gray-500 mt-0.5">This {category === 'task_type' ? 'task type' : 'complexity level'} will be removed from the system.</p>
          </div>
          <button onClick={onCancel} className="ml-auto text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5 mb-5">
          <p className="text-xs font-semibold text-amber-800">What happens to existing tasks?</p>
          <ul className="text-xs text-amber-700 space-y-1">
            <li>• Tasks already using <strong>{label}</strong> keep their current <strong>score_weight unchanged</strong> — scores are frozen as calculated.</li>
            <li>• The type/complexity string stays on those tasks in the database (scores remain valid).</li>
            <li>• <strong>{label}</strong> will no longer appear in the task creation form for new tasks.</li>
            {isBuiltIn && <li className="text-red-700">• This is a built-in weight. Deleting it cannot be undone without re-running migrations.</li>}
          </ul>
        </div>

        <p className="text-xs text-gray-400 font-mono mb-5">Key: {configKey}</p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Delete Weight
          </button>
        </div>
      </div>
    </div>
  )
}

interface AddFormProps {
  category: 'task_type' | 'complexity'
  onAdd: (data: { label: string; icon: string; weight: string }) => void
  onCancel: () => void
  error: string | null
  toSlugFn: (s: string) => string
}

function AddWeightForm({ category, onAdd, onCancel, error, toSlugFn }: AddFormProps) {
  const [label, setLabel] = useState('')
  const [icon, setIcon] = useState(category === 'task_type' ? '📋' : '🔵')
  const [weight, setWeight] = useState('1.0')

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        {category === 'task_type' ? 'New Task Type' : 'New Complexity Level'}
      </p>
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="w-16 flex-shrink-0">
            <label className="block text-xs text-gray-500 mb-1">Icon</label>
            <input
              type="text"
              value={icon}
              onChange={e => setIcon(e.target.value)}
              className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={category === 'task_type' ? 'e.g. Design Work' : 'e.g. Expert'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="w-24 flex-shrink-0">
            <label className="block text-xs text-gray-500 mb-1">Weight ×</label>
            <input
              type="number"
              min={0} max={10} step={0.1}
              value={weight}
              onChange={e => setWeight(e.target.value)}
              className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        {label && (
          <p className="text-xs text-gray-400">
            Key: <span className="font-mono">{category === 'task_type' ? 'task_type_' : 'complexity_'}{toSlugFn(label)}</span>
          </p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => onAdd({ label, icon, weight })}
            className="px-4 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Add
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PointConfigEditor({ initialConfigs }: Props) {
  const [configs, setConfigs] = useState<PointConfig[]>(initialConfigs)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recalculating, setRecalculating] = useState(false)
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null)
  const [addingType, setAddingType] = useState(false)
  const [addingComplexity, setAddingComplexity] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PointConfig | null>(null)

  const BUILT_IN_KEYS = [
    'task_type_monthly_task', 'task_type_new_implementation', 'task_type_ai',
    'complexity_easy', 'complexity_medium', 'complexity_difficult',
    'deadline_before_multiplier', 'deadline_on_multiplier', 'deadline_after_penalty_per_day',
  ]

  function getValue(key: string): number {
    return configs.find(c => c.config_key === key)?.config_value ?? 0
  }

  function setValue(key: string, value: number) {
    setConfigs(prev => prev.map(c => c.config_key === key ? { ...c, config_value: value } : c))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const res = await fetch('/api/admin/point-config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updates: configs.map(c => ({ config_key: c.config_key, config_value: c.config_value })),
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed to save')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleRecalculate() {
    setRecalculating(true)
    setRecalcMsg(null)
    const res = await fetch('/api/admin/point-config/recalculate', { method: 'POST' })
    setRecalculating(false)
    if (res.ok) {
      const d = await res.json()
      setRecalcMsg(`✓ Recalculated ${d.updated ?? 0} open task${d.updated !== 1 ? 's' : ''}`)
      setTimeout(() => setRecalcMsg(null), 4000)
    } else {
      setRecalcMsg('Failed to recalculate')
    }
  }

  async function handleAddNew(category: 'task_type' | 'complexity', data: { label: string; icon: string; weight: string }) {
    const label = data.label.trim()
    if (!label) { setAddError('Name is required'); return }
    const prefix = category === 'task_type' ? 'task_type_' : 'complexity_'
    const config_key = prefix + toSlug(label)
    const config_value = parseFloat(data.weight) || 1.0

    setAddError(null)
    const res = await fetch('/api/admin/point-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config_key, config_value, label, description: data.icon, category }),
    })
    if (!res.ok) {
      const d = await res.json()
      setAddError(d.error ?? 'Failed to add')
      return
    }
    const created = await res.json()
    setConfigs(prev => [...prev, created])
    if (category === 'task_type') setAddingType(false)
    else setAddingComplexity(false)
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    const res = await fetch('/api/admin/point-config', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config_key: deleteTarget.config_key }),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed to delete')
      setDeleteTarget(null)
      return
    }
    setConfigs(prev => prev.filter(c => c.config_key !== deleteTarget.config_key))
    setDeleteTarget(null)
  }

  const taskTypes = configs.filter(c => c.category === 'task_type')
  const complexities = configs.filter(c => c.category === 'complexity')
  const deadlines = configs.filter(c => c.category === 'deadline')

  const beforeMult = getValue('deadline_before_multiplier')
  const onMult = getValue('deadline_on_multiplier')
  const latePenalty = getValue('deadline_after_penalty_per_day')

  function matrixScore(typeKey: string, complexityKey: string): number {
    return Math.round(10 * getValue(typeKey) * getValue(complexityKey) * 100) / 100
  }

  return (
    <>
      {deleteTarget && (
        <DeleteConfirmModal
          configKey={deleteTarget.config_key}
          label={deleteTarget.label}
          category={deleteTarget.category}
          isBuiltIn={BUILT_IN_KEYS.includes(deleteTarget.config_key)}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className="space-y-6">

        {/* Task Type Weights */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-bold text-gray-800">Task Type Weights</h2>
              <p className="text-xs text-gray-400 mt-0.5">Multiplier applied to base score (10) for each task type.</p>
            </div>
            <button
              onClick={() => { setAddingType(v => !v); setAddError(null) }}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus size={13} /> Add Type
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {taskTypes.map(c => {
              const helper = getHelperText(c)
              return (
                <div key={c.config_key} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-xl w-8 text-center flex-shrink-0">{getIcon(c)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{c.label}</p>
                    {helper && <p className="text-xs text-gray-500 leading-snug">{helper}</p>}
                    <p className="text-[10px] text-gray-300 font-mono truncate mt-0.5">{c.config_key}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-400">×</span>
                    <input
                      type="number"
                      min={0} max={10} step={0.1}
                      value={c.config_value}
                      onChange={e => setValue(c.config_key, parseFloat(e.target.value) || 0)}
                      className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                    <button
                      onClick={() => setDeleteTarget(c)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {addingType && (
            <div className="px-5 pb-5">
              <AddWeightForm
                category="task_type"
                onAdd={data => handleAddNew('task_type', data)}
                onCancel={() => { setAddingType(false); setAddError(null) }}
                error={addError}
                toSlugFn={toSlug}
              />
            </div>
          )}
        </div>

        {/* Complexity Weights */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-bold text-gray-800">Complexity Weights</h2>
              <p className="text-xs text-gray-400 mt-0.5">Multiplier applied based on how complex the task is.</p>
            </div>
            <button
              onClick={() => { setAddingComplexity(v => !v); setAddError(null) }}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus size={13} /> Add Level
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {complexities.map(c => {
              const helper = getHelperText(c)
              return (
                <div key={c.config_key} className="flex items-center gap-3 px-5 py-3">
                  <span className="text-xl w-8 text-center flex-shrink-0">{getIcon(c)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{c.label}</p>
                    {helper && <p className="text-xs text-gray-500 leading-snug">{helper}</p>}
                    <p className="text-[10px] text-gray-300 font-mono truncate mt-0.5">{c.config_key}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-gray-400">×</span>
                    <input
                      type="number"
                      min={0} max={10} step={0.1}
                      value={c.config_value}
                      onChange={e => setValue(c.config_key, parseFloat(e.target.value) || 0)}
                      className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                    <button
                      onClick={() => setDeleteTarget(c)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {addingComplexity && (
            <div className="px-5 pb-5">
              <AddWeightForm
                category="complexity"
                onAdd={data => handleAddNew('complexity', data)}
                onCancel={() => { setAddingComplexity(false); setAddError(null) }}
                error={addError}
                toSlugFn={toSlug}
              />
            </div>
          )}
        </div>

        {/* Deadline Rules */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-800">Deadline Scoring Rules</h2>
            <p className="text-xs text-gray-400 mt-0.5">Controls how completion timing affects the final earned score.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {deadlines.map(c => (
              <div key={c.config_key} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{c.label}</p>
                  {c.description && <p className="text-xs text-gray-400">{c.description}</p>}
                </div>
                <input
                  type="number"
                  min={0} max={10} step={0.1}
                  value={c.config_value}
                  onChange={e => setValue(c.config_key, parseFloat(e.target.value) || 0)}
                  className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center font-mono bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white flex-shrink-0"
                />
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 space-y-1">
            <p className="text-xs text-gray-500">• Completed <strong>before</strong> deadline → potential × {beforeMult}</p>
            <p className="text-xs text-gray-500">• Completed <strong>on</strong> deadline → potential × {onMult}</p>
            <p className="text-xs text-gray-500">• Completed <strong>after</strong> deadline → MAX(0, potential − {latePenalty} × days late)</p>
          </div>
        </div>

        {/* Live Score Matrix */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <Zap size={15} className="text-blue-500" />
            <div>
              <h2 className="text-sm font-bold text-gray-800">Live Score Matrix</h2>
              <p className="text-xs text-gray-400 mt-0.5">Potential points = 10 × task type weight × complexity weight</p>
            </div>
          </div>
          <div className="p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left pb-3 font-medium text-gray-400 text-xs pr-4"></th>
                  {complexities.map(c => (
                    <th key={c.config_key} className="text-center pb-3 font-semibold text-gray-600 text-xs px-2">
                      {getIcon(c)} {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {taskTypes.map(tt => (
                  <tr key={tt.config_key} className="border-t border-gray-100">
                    <td className="py-2.5 pr-4 font-medium text-gray-700 text-xs whitespace-nowrap">
                      {getIcon(tt)} {tt.label}
                    </td>
                    {complexities.map(cx => {
                      const score = matrixScore(tt.config_key, cx.config_key)
                      return (
                        <td key={cx.config_key} className="py-2.5 text-center px-2">
                          <span className="inline-block px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold text-sm">
                            {score}
                          </span>
                          <p className="text-xs text-gray-400 mt-0.5">
                            early: {Math.round(score * beforeMult * 100) / 100}
                          </p>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertTriangle size={15} className="flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save size={14} />
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
            </button>
            <button
              onClick={() => setConfigs(initialConfigs)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RotateCcw size={13} /> Reset
            </button>
            <button
              onClick={handleRecalculate}
              disabled={recalculating}
              className="flex items-center gap-2 px-4 py-2 border border-orange-200 text-orange-700 bg-orange-50 text-sm font-medium rounded-lg hover:bg-orange-100 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={13} className={recalculating ? 'animate-spin' : ''} />
              {recalculating ? 'Recalculating…' : 'Recalculate Open Tasks'}
            </button>
            {recalcMsg && <span className="text-xs font-medium text-green-700">{recalcMsg}</span>}
          </div>
          <p className="text-xs text-gray-400 mt-2">Save weights first, then hit Recalculate to apply new weights to all existing open (non-done) tasks.</p>
        </div>

      </div>
    </>
  )
}
