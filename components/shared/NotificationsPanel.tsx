'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, Check, CheckCheck, X, ExternalLink, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Notification } from '@/types'

const APPROVAL_TITLES = new Set([
  'Score confirmed',
  'Completion rejected',
  'Date change approved',
  'Date change rejected',
  'Task completed by assignee',
])

function SenderAvatar({ sender }: { sender: Notification['sender'] }) {
  if (!sender) {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
        <Bell size={14} className="text-gray-400" />
      </div>
    )
  }
  if (sender.avatar_url) {
    return (
      <img
        src={sender.avatar_url}
        alt={sender.full_name}
        className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-1 ring-gray-200"
      />
    )
  }
  const initials = sender.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 ring-1 ring-blue-200">
      <span className="text-[10px] font-bold text-blue-700">{initials}</span>
    </div>
  )
}

export default function NotificationsPanel() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [popupDismissed, setPopupDismissed] = useState(false)
  const [clearing, setClearing] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unread = notifications.filter(n => !n.read).length
  const readCount = notifications.filter(n => n.read).length
  const approvalAlerts = notifications.filter(n => !n.read && APPROVAL_TITLES.has(n.title))
  const showPopup = approvalAlerts.length > 0 && !popupDismissed

  async function fetchNotifications() {
    const res = await fetch('/api/notifications')
    if (res.ok) {
      const data = await res.json()
      setNotifications(data)
      setPopupDismissed(false)
    }
  }

  useEffect(() => { fetchNotifications() }, [])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [] }) })
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  async function markRead(id: string) {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id] }) })
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  async function clearRead() {
    setClearing(true)
    const res = await fetch('/api/notifications', { method: 'DELETE' })
    setClearing(false)
    if (res.ok) setNotifications(prev => prev.filter(n => !n.read))
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <>
      {/* Approval popup modal */}
      {showPopup && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-blue-600" />
                <h2 className="font-semibold text-gray-900 text-sm">Action Required</h2>
              </div>
              <button
                onClick={() => setPopupDismissed(true)}
                className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
              {approvalAlerts.map(n => (
                <div key={n.id} className="px-5 py-4 flex gap-3">
                  <SenderAvatar sender={n.sender} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                    <p className="text-sm text-gray-600 mt-0.5">{n.body}</p>
                    <div className="flex items-center justify-between mt-1.5 flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        {n.sender && (
                          <span className="text-gray-500 font-medium">From {n.sender.full_name} ·</span>
                        )}
                        <span>{formatTime(n.created_at)}</span>
                      </div>
                      {n.link && (
                        <Link
                          href={n.link}
                          onClick={() => { markRead(n.id); setPopupDismissed(true) }}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium"
                        >
                          View Task <ExternalLink size={11} />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50">
              <button
                onClick={async () => {
                  await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: approvalAlerts.map(n => n.id) }) })
                  setNotifications(prev => prev.map(n => approvalAlerts.some(a => a.id === n.id) ? { ...n, read: true } : n))
                  setPopupDismissed(true)
                }}
                className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Mark as read & close
              </button>
              <button
                onClick={() => setPopupDismissed(true)}
                className="px-4 py-1.5 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bell + dropdown */}
      <div className="relative" ref={ref}>
        <button
          onClick={() => { setOpen(o => !o); if (!open) fetchNotifications() }}
          className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <Bell size={20} className="text-gray-600 dark:text-gray-300" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center leading-none">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-11 w-84 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-50 overflow-hidden" style={{ width: '22rem' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Notifications</h3>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    <CheckCheck size={12} /> Mark all read
                  </button>
                )}
                {readCount > 0 && (
                  <button
                    onClick={clearRead}
                    disabled={clearing}
                    title={`Clear ${readCount} read notification${readCount === 1 ? '' : 's'}`}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50 transition-colors"
                  >
                    <Trash2 size={11} />
                    {clearing ? 'Clearing…' : `Clear read (${readCount})`}
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="max-h-[28rem] overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No notifications yet</p>
              ) : (
                notifications.map(n => {
                  const inner = (
                    <>
                      <SenderAvatar sender={n.sender} />
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium leading-snug', !n.read ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300')}>
                          {n.title}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{n.body}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {n.sender && (
                            <span className="text-[11px] text-gray-500 font-medium">
                              From {n.sender.full_name}
                            </span>
                          )}
                          <span className="text-[11px] text-gray-400">
                            {n.sender ? '·' : ''} {new Date(n.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {n.link && (
                            <span className="text-[11px] text-blue-500 flex items-center gap-0.5 font-medium">
                              · View Task <ExternalLink size={9} />
                            </span>
                          )}
                        </div>
                      </div>
                      {!n.read && (
                        <button
                          onClick={e => { e.preventDefault(); e.stopPropagation(); markRead(n.id) }}
                          className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-600 flex-shrink-0 self-start mt-0.5"
                          title="Mark as read"
                        >
                          <Check size={13} />
                        </button>
                      )}
                    </>
                  )

                  const rowClass = cn(
                    'flex items-start gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800 last:border-0 transition-colors',
                    !n.read ? 'bg-blue-50/60 dark:bg-blue-950' : 'hover:bg-gray-50 dark:hover:bg-gray-800',
                    n.link && 'cursor-pointer'
                  )

                  return n.link ? (
                    <Link
                      key={n.id}
                      href={n.link}
                      onClick={() => { markRead(n.id); setOpen(false) }}
                      className={rowClass}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div key={n.id} className={rowClass}>
                      {inner}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
