'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, Target } from 'lucide-react'

interface EligibleUser {
  id: string
  full_name: string
}

interface Props {
  month: number
  year: number
  totalMembers: number
  onClose: () => void
  onSuccess: () => void
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function AwardBonusModal({ month, year, totalMembers, onClose, onSuccess }: Props) {
  const [step,         setStep]         = useState<'preview' | 'done'>('preview')
  const [loading,      setLoading]      = useState(false)
  const [eligible,     setEligible]     = useState<EligibleUser[] | null>(null)
  const [awarded,      setAwarded]      = useState<number | null>(null)
  const [error,        setError]        = useState<string | null>(null)

  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year

  async function loadPreview() {
    setLoading(true)
    setError(null)
    try {
      // Dry-run: fetch current leaves to determine eligibility
      const res = await fetch(`/api/attendance/admin?month=${month}&year=${year}`)
      const leaves: Array<{ user_id: string }> = await res.json()
      const usersWithLeaves = new Set(leaves.map(l => l.user_id))

      // Fetch all active members
      const profilesRes = await fetch('/api/profiles/active')
      if (!profilesRes.ok) throw new Error('Failed to load members')
      const allMembers: EligibleUser[] = await profilesRes.json()

      setEligible(allMembers.filter(m => !usersWithLeaves.has(m.id)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load preview')
    } finally {
      setLoading(false)
    }
  }

  // Load preview on first render
  useEffect(() => { loadPreview() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAward() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/attendance/award-bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Award failed')
      setAwarded(data.awarded)
      setStep('done')
      onSuccess()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center">
              <Target size={16} className="text-teal-600" />
            </div>
            <h2 className="text-base font-bold text-gray-900">Award Perfect Attendance</h2>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 p-1">
            <X size={16} />
          </button>
        </div>

        {step === 'done' ? (
          <div className="text-center py-4 space-y-3">
            <div className="text-4xl">🎉</div>
            <p className="text-base font-semibold text-gray-900">
              +25 pts awarded to {awarded} user{awarded !== 1 ? 's' : ''}!
            </p>
            <p className="text-sm text-gray-500">
              Points credited to {MONTH_NAMES[nextMonth - 1]} {nextYear} scores.
            </p>
            <button
              onClick={onClose}
              className="mt-2 w-full px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-1 mb-4">
              <p className="text-sm text-gray-600">
                Month: <span className="font-semibold text-gray-800">{MONTH_NAMES[month - 1]} {year}</span>
              </p>
              <p className="text-sm text-gray-600">
                Crediting to: <span className="font-semibold text-teal-700">{MONTH_NAMES[nextMonth - 1]} {nextYear}</span>
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Eligible users (zero leaves this month)
              </p>
              {loading && !eligible ? (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                  <Loader2 size={12} className="animate-spin" /> Loading…
                </div>
              ) : eligible && eligible.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">No eligible users — all members have leaves logged.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5">
                  {(eligible ?? []).map(u => (
                    <div key={u.id} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                        {initials(u.full_name)}
                      </div>
                      <span className="text-sm text-gray-700">{u.full_name}</span>
                    </div>
                  ))}
                </div>
              )}
              {eligible && (
                <p className="text-xs text-gray-400 mt-2">
                  {eligible.length} of {totalMembers} team members
                </p>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
              <p className="text-xs text-amber-700">
                ⚠ Users already awarded this month will be skipped automatically.
              </p>
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAward}
                disabled={loading || (eligible !== null && eligible.length === 0)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {loading && <Loader2 size={13} className="animate-spin" />}
                Award 25 pts{eligible ? ` to ${eligible.length}` : ''}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
