'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Clock, Send, ChevronDown } from 'lucide-react'

interface Member {
  id: string
  full_name: string
}

interface Props {
  settingKey: string
  label: string
  description: string
  role: 'admin' | 'member'
  initialEnabled: boolean
  initialSendTime: string
  members?: Member[]
}

export default function EmailSettingCard({
  settingKey,
  label,
  description,
  role,
  initialEnabled,
  initialSendTime,
  members = [],
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [sendTime, setSendTime] = useState(initialSendTime)
  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.id ?? '')

  const [toggleLoading, setToggleLoading] = useState(false)
  const [timeLoading, setTimeLoading] = useState(false)
  const [testLoading, setTestLoading] = useState(false)

  const [toggleError, setToggleError] = useState<string | null>(null)
  const [timeSaved, setTimeSaved] = useState(false)
  const [timeError, setTimeError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function handleToggle() {
    setToggleLoading(true)
    setToggleError(null)
    const next = !enabled
    const res = await fetch('/api/admin/email-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: settingKey, enabled: next }),
    })
    setToggleLoading(false)
    if (res.ok) {
      setEnabled(next)
    } else {
      const data = await res.json()
      setToggleError(data.error ?? 'Failed to save')
    }
  }

  async function handleSaveTime() {
    setTimeLoading(true)
    setTimeError(null)
    setTimeSaved(false)
    const res = await fetch('/api/admin/email-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: settingKey, send_time: sendTime }),
    })
    setTimeLoading(false)
    if (res.ok) {
      setTimeSaved(true)
      setTimeout(() => setTimeSaved(false), 3000)
    } else {
      const data = await res.json()
      setTimeError(data.error ?? 'Failed to save time')
    }
  }

  async function handleTestEmail() {
    setTestLoading(true)
    setTestResult(null)
    const body = role === 'admin'
      ? { key: settingKey }
      : { key: settingKey, memberId: selectedMemberId }

    const res = await fetch('/api/admin/email-settings/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setTestLoading(false)
    if (res.ok) {
      setTestResult({ ok: true, message: `Test email sent to ${data.sentTo}` })
    } else {
      setTestResult({ ok: false, message: data.error ?? 'Failed to send test email' })
    }
    setTimeout(() => setTestResult(null), 6000)
  }

  const roleBadge = role === 'admin'
    ? 'bg-purple-100 text-purple-700 border-purple-200'
    : 'bg-blue-100 text-blue-700 border-blue-200'
  const roleLabel = role === 'admin' ? 'Admin' : 'Member'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn('text-[11px] px-2.5 py-0.5 rounded-full border font-semibold uppercase tracking-wide', roleBadge)}>
                {roleLabel}
              </span>
            </div>
            <h3 className="text-base font-bold text-gray-900">{label}</h3>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">{description}</p>
          </div>

          {/* Toggle */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0 mt-1">
            <button
              type="button"
              onClick={handleToggle}
              disabled={toggleLoading}
              aria-label={enabled ? 'Disable' : 'Enable'}
              className={cn(
                'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed',
                enabled ? 'bg-blue-600 focus:ring-blue-500' : 'bg-gray-200 focus:ring-gray-400'
              )}
            >
              <span className={cn(
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                enabled ? 'translate-x-5' : 'translate-x-0'
              )} />
            </button>
            <span className={cn('text-[10px] font-bold uppercase tracking-wide', enabled ? 'text-blue-600' : 'text-gray-400')}>
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
            {toggleError && <p className="text-[11px] text-red-500">{toggleError}</p>}
          </div>
        </div>
      </div>

      {/* Send time */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-600 font-medium min-w-0">
          <Clock size={15} className="text-gray-400 flex-shrink-0" />
          <span className="whitespace-nowrap">Send time (IST)</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="time"
            value={sendTime}
            onChange={e => setSendTime(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-gray-50"
          />
          <button
            type="button"
            onClick={handleSaveTime}
            disabled={timeLoading}
            className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {timeLoading ? 'Saving…' : 'Update'}
          </button>
          {timeSaved && <span className="text-[12px] text-green-600 font-medium">Saved</span>}
          {timeError && <span className="text-[12px] text-red-500">{timeError}</span>}
        </div>
      </div>

      {/* Test email */}
      <div className="px-6 py-4 bg-gray-50">
        <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Test Email</p>
        <div className="flex items-center gap-3 flex-wrap">
          {role === 'member' && members.length > 0 && (
            <div className="relative">
              <select
                value={selectedMemberId}
                onChange={e => setSelectedMemberId(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 cursor-pointer"
              >
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}

          {role === 'admin' && (
            <p className="text-sm text-gray-500">Sends to your email address</p>
          )}

          <button
            type="button"
            onClick={handleTestEmail}
            disabled={testLoading || (role === 'member' && !selectedMemberId)}
            className="flex items-center gap-1.5 text-sm px-4 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            <Send size={13} />
            {testLoading ? 'Sending…' : 'Send Test Email'}
          </button>

          {testResult && (
            <span className={cn('text-[12px] font-medium', testResult.ok ? 'text-green-600' : 'text-red-500')}>
              {testResult.message}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
