'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Lock, AlertTriangle } from 'lucide-react'
import type { AnnouncementRow, AttachmentRow } from './types'
import RewardStrip from './RewardStrip'
import ScreenshotGallery from './ScreenshotGallery'
import AcceptSuccessState from './AcceptSuccessState'

interface Props {
  announcement: AnnouncementRow
  attachments?: AttachmentRow[]
  onClose: () => void
  /** Called after the server responds — passes the new status so the parent can refresh. */
  onAccepted?: (result: { status: 'requested' | 'approved'; task_id: string | null }) => void
  /** Where the "Back" button on the success card should go. */
  backHref?: string
}

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AcceptConfirmationModal({
  announcement, attachments = [], onClose, onAccepted, backHref = '/announcements',
}: Props) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [taken, setTaken] = useState(false)
  const [acceptedTaskId, setAcceptedTaskId] = useState<string | null>(null)
  const [requested, setRequested] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === backdropRef.current && !submitting) onClose()
  }

  async function handleAccept() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/announcements/${announcement.id}/accept`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json().catch(() => null)
      if (res.status === 409 && (data?.code === 'already_accepted' || data?.code === 'closed')) {
        setTaken(true)
        return
      }
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : `Accept failed (${res.status})`)
      }
      const status = data?.status as 'requested' | 'approved'
      const taskId = (data?.task_id as string | null) ?? null
      if (status === 'approved') {
        setAcceptedTaskId(taskId)
      } else {
        setRequested(true)
      }
      onAccepted?.({ status, task_id: taskId })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Accept failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const taskPoints = announcement.score_weight ?? 0
  const totalPoints = taskPoints + (announcement.bonus_points ?? 0)

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdrop}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      {acceptedTaskId ? (
        <AcceptSuccessState
          taskId={acceptedTaskId}
          totalPoints={totalPoints}
          awardIcon={announcement.award_types?.icon ?? null}
          awardName={announcement.award_types?.name ?? null}
          bonusPoints={announcement.bonus_points}
          backHref={backHref}
        />
      ) : requested ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 text-center space-y-3">
          <p className="text-2xl">⏳</p>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Request submitted</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            The admin will review and approve finalists. If approved, the task will appear on your list and you&apos;ll see it on the Announcements page under <em>My approved</em>.
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Bonus points are split equally among everyone the admin approves on this announcement.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            Close
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              {taken ? 'Already accepted' : 'Accept this announcement?'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
            >
              <X size={18} />
            </button>
          </div>

          <div className="px-5 py-4 overflow-y-auto space-y-4">
            {taken ? (
              <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
                <p className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <AlertTriangle size={16} />
                  Someone else accepted this announcement first.
                </p>
                <p>You can check the live announcements list for what&apos;s still open.</p>
              </div>
            ) : (
              <>
                <RewardStrip
                  awardIcon={announcement.award_types?.icon ?? null}
                  awardName={announcement.award_types?.name ?? null}
                  taskPoints={taskPoints}
                  bonusPoints={announcement.bonus_points}
                  variant="hero"
                  showAnimation={false}
                />

                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                    Task you&apos;ll be committing to
                  </p>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 space-y-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{announcement.title}</p>
                    {announcement.description && (
                      <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-line">{announcement.description}</p>
                    )}
                    <div className="text-xs text-gray-700 dark:text-gray-300 flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
                      <span className="inline-flex items-center gap-1">
                        <Lock size={12} className="text-amber-600 dark:text-amber-400" />
                        Due <strong className="font-semibold">{formatDate(announcement.due_date)}</strong>
                        <span className="text-gray-500 dark:text-gray-400">(set by admin · cannot be changed)</span>
                      </span>
                    </div>
                    <div className="text-xs text-gray-700 dark:text-gray-300 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span>Priority <strong className="capitalize">{announcement.priority}</strong></span>
                      {announcement.task_type && <span>Type <strong>{announcement.task_type.replace(/_/g, ' ')}</strong></span>}
                      {announcement.complexity && <span>· <strong className="capitalize">{announcement.complexity}</strong></span>}
                    </div>
                  </div>
                </div>

                {attachments.length > 0 && (
                  <ScreenshotGallery
                    title="Reference screenshots from admin"
                    items={attachments.map(a => ({ id: a.id, file_name: a.file_name, viewUrl: a.viewUrl }))}
                    size="sm"
                  />
                )}

                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>Once accepted, this becomes a task on your list and other teammates can no longer accept it.</span>
                </div>

                {error && (
                  <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                )}
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              {taken ? 'Close' : 'Cancel'}
            </button>
            {!taken && (
              <button
                type="button"
                onClick={handleAccept}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-sm disabled:opacity-60 disabled:cursor-wait inline-flex items-center gap-2"
              >
                {submitting ? 'Accepting…' : `Yes, accept this task`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
