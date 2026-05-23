'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, Clock, ExternalLink, X, UserMinus } from 'lucide-react'

export type MemberStatus = 'not_yet' | 'requested' | 'approved'

export interface TaggedUserRow {
  id: string
  full_name: string
  avatar_url: string | null
  department: string | null
  status: MemberStatus
  acceptance_id: string | null
  task_id: string | null
  requested_at: string | null
  approved_at: string | null
}

interface Props {
  announcementId: string
  /**
   * Every member in scope for this announcement, with their current status.
   * For target_mode='users': one row per tagged user (status = 'approved' if
   * they've accepted, else 'not_yet').
   * For target_mode='department': one row per active member in any target
   * department (status reflects whether they've requested, been approved,
   * or haven't responded).
   */
  members: TaggedUserRow[]
  /** Total bonus on the announcement — drives the live split preview. */
  totalBonus: number
  /** 'users' renders all rows together; 'department' groups by status. */
  mode: 'users' | 'department'
  /** Current announcement.user_ids — needed to compute the PATCH payload when
   *  untagging. Only used in `users` mode. */
  announcementUserIds?: string[]
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function Avatar({ user }: { user: TaggedUserRow }) {
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

export default function TaggedUsersPanel({ announcementId, members, totalBonus, mode, announcementUserIds = [] }: Props) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const approvedCount = members.filter(m => m.status === 'approved').length
  const requestedCount = members.filter(m => m.status === 'requested').length
  const notYetCount = members.filter(m => m.status === 'not_yet').length

  const sharePerPerson = approvedCount > 0 ? Math.floor(totalBonus / approvedCount) : totalBonus

  async function approve(acceptanceId: string | null) {
    if (!acceptanceId) return
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

  async function untag(userId: string, userName: string) {
    if (mode !== 'users') return
    if (announcementUserIds.length <= 1) {
      setError('Can\'t untag the last remaining user. Add another user first or switch the announcement to department targeting.')
      return
    }
    if (!confirm(`Untag ${userName} from this announcement?`)) return
    setBusyId(userId); setError(null)
    try {
      const nextUserIds = announcementUserIds.filter(uid => uid !== userId)
      const res = await fetch(`/api/admin/announcements/${announcementId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_ids: nextUserIds }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(typeof data?.error === 'string' ? data.error : `Untag failed (${res.status}).`)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Untag failed.')
    } finally {
      setBusyId(null)
    }
  }

  async function decline(acceptanceId: string | null) {
    if (!acceptanceId) return
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

  // For dept mode: group by status so the eye lands on pending requests first.
  // For users mode: keep the original order (the tagged user order).
  const ordered = mode === 'department'
    ? [
        ...members.filter(m => m.status === 'requested'),
        ...members.filter(m => m.status === 'approved'),
        ...members.filter(m => m.status === 'not_yet'),
      ]
    : members

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex-wrap">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">
            {mode === 'users' ? '🎯 Tagged users' : '👥 Department members'} ({members.length})
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5 flex-wrap">
            {approvedCount > 0 && <span className="font-semibold text-emerald-700 dark:text-emerald-300">{approvedCount} approved</span>}
            {requestedCount > 0 && (
              <>
                {approvedCount > 0 && <span className="text-gray-400">·</span>}
                <span className="font-semibold text-orange-700 dark:text-orange-300">{requestedCount} awaiting approval</span>
              </>
            )}
            {notYetCount > 0 && (
              <>
                {(approvedCount > 0 || requestedCount > 0) && <span className="text-gray-400">·</span>}
                <span className="font-semibold text-amber-700 dark:text-amber-300">{notYetCount} not yet responded</span>
              </>
            )}
          </p>
        </div>

        {totalBonus > 0 && approvedCount > 0 && (
          <p className="px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-300 border-b border-gray-100 dark:border-gray-800 bg-amber-50/40 dark:bg-amber-950/20">
            Bonus split: <strong>{sharePerPerson}</strong> pts per approved accepter ({totalBonus} ÷ {approvedCount}). The split is recomputed at each task&rsquo;s completion-approval time.
          </p>
        )}

        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {ordered.map(u => (
            <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Avatar user={u} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{u.full_name}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {u.department ?? '—'}
                    {u.status === 'requested' && u.requested_at && (
                      <> · requested {new Date(u.requested_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</>
                    )}
                    {u.status === 'approved' && u.approved_at && (
                      <> · approved {new Date(u.approved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {u.status === 'approved' && (
                  <>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
                      <Check size={11} /> Accepted
                    </span>
                    {u.task_id && (
                      <Link
                        href={`/tasks/${u.task_id}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        Task <ExternalLink size={10} />
                      </Link>
                    )}
                  </>
                )}
                {u.status === 'requested' && (
                  <>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-800">
                      <Clock size={11} /> Awaiting approval
                    </span>
                    <button
                      type="button"
                      onClick={() => approve(u.acceptance_id)}
                      disabled={busyId === u.acceptance_id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50"
                    >
                      <Check size={12} /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => decline(u.acceptance_id)}
                      disabled={busyId === u.acceptance_id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                    >
                      <X size={12} /> Decline
                    </button>
                  </>
                )}
                {u.status === 'not_yet' && (
                  <>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
                      <Clock size={11} /> Not yet accepted
                    </span>
                    {mode === 'users' && (
                      <button
                        type="button"
                        onClick={() => untag(u.id, u.full_name)}
                        disabled={busyId === u.id || announcementUserIds.length <= 1}
                        title={announcementUserIds.length <= 1 ? 'Can\'t remove the last tagged user' : 'Untag this user'}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <UserMinus size={12} /> Untag
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
