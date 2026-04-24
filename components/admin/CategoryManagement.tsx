'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, Tag, AlertCircle } from 'lucide-react'
import type { Category } from '@/types'

export default function CategoryManagement() {
  const [categories, setCategories] = useState<Category[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchCategories()
  }, [])

  async function fetchCategories() {
    setError(null)
    try {
      const res = await fetch('/api/categories', { cache: 'no-store' })
      const data = await res.json()
      if (res.ok) {
        setCategories(data)
      } else {
        setError(data.error || 'Failed to fetch categories')
      }
    } catch (err) {
      console.error(err)
      setError('Connection error fetching categories')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
        setNewName('')
      } else {
        setError(data.error || 'Failed to add category')
      }
    } catch (err) {
      console.error(err)
      setError('Connection error adding category')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Are you sure? This will remove the category from the dropdown options.')) return
    setError(null)
    try {
      const res = await fetch(`/api/categories?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setCategories(prev => prev.filter(c => c.id !== id))
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to delete category')
      }
    } catch (err) {
      console.error(err)
      setError('Connection error deleting category')
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Tag size={18} className="text-blue-500" />
            Category Management
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Define global categories for tasks and planning.</p>
        </div>
        {loading && <Loader2 size={16} className="text-gray-400 animate-spin" />}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs font-medium">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="e.g. SEO, Social Media, Content"
          className="flex-1 text-sm bg-gray-50 border border-gray-100 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all outline-none"
          disabled={saving}
        />
        <button
          type="submit"
          disabled={!newName.trim() || saving}
          className="inline-flex items-center gap-2 px-6 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold rounded-lg transition-all disabled:opacity-50 shadow-sm"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Add
        </button>
      </form>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-8 bg-gray-100 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {categories.map(category => (
            <div
              key={category.id}
              className="group flex items-center gap-2 bg-white border border-gray-200 rounded-lg pl-3 pr-1 py-1 text-sm font-semibold text-gray-700 hover:border-blue-200 hover:bg-blue-50 transition-all"
            >
              {category.name}
              <button
                onClick={() => handleDelete(category.id)}
                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {categories.length === 0 && !error && (
            <div className="w-full py-6 text-center border border-dashed border-gray-200 rounded-xl">
              <p className="text-sm text-gray-400 italic">No categories defined yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
