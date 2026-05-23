'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, X, ExternalLink } from 'lucide-react'

export interface AcceptanceRow {
  id: string
  user_id: string
  status: 'requested' | 'approved'
  task_id: string | null
  requested_at: string
  approved_at: string | null
  user: {
    full_name: string
    avatar_url: string | null
    department: string | null
  } | null
}

interface Props {
  announcementId: string
  acceptances: AcceptanceRow[]
  /** Currently approved count — drives the bonus split preview. */
  totalBonus: number
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function Avatar({ user }: { user: AcceptanceRow['user'] }) {
  if (!user) return null
  if (user.avatar_url) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={user.avatar_url} alt={user.full_name} className="w-8 h-8 rounded-full object-cover" />
  }
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs font-bold flex items-center justify-center">
      {initials(user.full_name)}
    </div>
  )
}

export default function AcceptanceRequestsPanel({ announcementId, acceptances, totalBonus }: Props) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const requested = acceptances.filter(a => a.status === 'requested')
  const approved = acceptances.filter(a => a.status === 'approved')
  const approvedCount = approved.length
  const sharePerPerson = approvedCount > 0 ? Math.floor(totalBonus / approvedCount) : totalBonus

  async function approve(acceptanceId: string) {
    setBusyId(acceptanceId); setError(null)
    try {
      const res = await fetch(`/api/admin/announcements/${announcementId}/acceptances/${acceptanceId}/approve`, {
        method: 'POST', credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(typeof data?.error === 'string' ? data.error : `Approve failed (${res.status}).`)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed.')
    } finally {
      setBusyId(null)
    }
  }

  async function reject(acceptanceId: string) {
    if (!confirm('Decline this request?')) return
    setBusyId(acceptanceId); setError(null)
    try {
      const res = await fetch(`/api/admin/announcements/${announcementId}/acceptances/${acceptanceId}/approve`, {
        method: 'DELETE', credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(typeof data?.error === 'string' ? data.error : `Decline failed (${res.status}).`)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decline failed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      {totalBonus > 0 && approvedCount > 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          Bonus split: <strong>{sharePerPerson}</strong> pts per approved accepter ({totalBonus} ÷ {approvedCount}). Each new approval recomputes the share for that approval&rsquo;s task at completion-approval time.
        </p>
      )}

      {requested.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20">
          <div className="px-3 py-2 border-b border-amber-200 dark:border-amber-900/50 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
            Pending requests ({requested.length})
          </div>
          <ul className="divide-y divide-amber-200/60 dark:divide-amber-900/40">
            {requested.map(r => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar user={r.user} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {r.user?.full_name ?? r.user_id.slice(0, 8)}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {r.user?.department ?? '—'} · requested {new Date(r.requested_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => approve(r.id)}
                    disabled={busyId === r.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50"
                  >
                    <Check size={12} /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => reject(r.id)}
                    disabled={busyId === r.id}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                  >
                    <X size={12} /> Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {approved.length > 0 && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20">
          <div className="px-3 py-2 border-b border-emerald-200 dark:border-emerald-900/50 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
            Approved accepters ({approved.length})
          </div>
          <ul className="divide-y divide-emerald-200/60 dark:divide-emerald-900/40">
            {approved.map(r => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar user={r.user} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {r.user?.full_name ?? r.user_id.slice(0, 8)}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {r.user?.department ?? '—'} · approved {r.approved_at ? new Date(r.approved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                    </p>
                  </div>
                </div>
                {r.task_id && (
                  <Link
                    href={`/tasks/${r.task_id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Open task <ExternalLink size={11} />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
