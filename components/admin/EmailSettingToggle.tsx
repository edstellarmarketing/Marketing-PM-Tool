'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  settingKey: string
  initialEnabled: boolean
  label: string
  description: string
}

export default function EmailSettingToggle({ settingKey, initialEnabled, label, description }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleToggle() {
    setLoading(true)
    setError(null)
    const next = !enabled
    const res = await fetch('/api/admin/email-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: settingKey, enabled: next }),
    })
    setLoading(false)
    if (res.ok) {
      setEnabled(next)
    } else {
      const data = await res.json()
      setError(data.error ?? 'Failed to save')
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 py-4 px-5 bg-white rounded-xl border border-gray-200">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <span className={cn(
            'text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide',
            enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          )}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>

      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        aria-label={enabled ? 'Disable' : 'Enable'}
        className={cn(
          'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed mt-0.5',
          enabled ? 'bg-blue-600' : 'bg-gray-200'
        )}
      >
        <span className={cn(
          'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
          enabled ? 'translate-x-5' : 'translate-x-0'
        )} />
      </button>
    </div>
  )
}
