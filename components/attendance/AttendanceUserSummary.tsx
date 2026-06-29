'use client'

import { useMemo, useState } from 'react'
import { Search, Users } from 'lucide-react'
import type { AttendanceLeave } from '@/types'

export interface LeaveWithProfile extends AttendanceLeave {
  profiles: { id: string; full_name: string; avatar_url: string | null; department: string | null } | null
}

interface Props {
  leaves: LeaveWithProfile[]
  monthLabel: string
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function dayValue(l: AttendanceLeave) {
  return l.is_half_day ? 0.5 : 1
}

function fmtVal(n: number) {
  return n % 1 === 0 ? `${n}` : n.toFixed(1)
}

function fmtDay(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

interface UserRow {
  userId: string
  name: string
  avatar: string | null
  department: string
  leaves: LeaveWithProfile[]   // non-rejected, sorted by date
  approvedValue: number
  pendingValue: number
}

export default function AttendanceUserSummary({ leaves, monthLabel }: Props) {
  const [dept, setDept] = useState('all')
  const [search, setSearch] = useState('')

  const departments = useMemo(() => {
    const set = new Set<string>()
    for (const l of leaves) {
      const d = l.profiles?.department
      if (d) set.add(d)
    }
    return Array.from(set).sort()
  }, [leaves])

  const rows = useMemo<UserRow[]>(() => {
    const byUser = new Map<string, UserRow>()
    for (const l of leaves) {
      if (l.status === 'rejected') continue
      const uid = l.user_id
      let row = byUser.get(uid)
      if (!row) {
        row = {
          userId: uid,
          name: l.profiles?.full_name ?? 'Unknown',
          avatar: l.profiles?.avatar_url ?? null,
          department: l.profiles?.department ?? '—',
          leaves: [],
          approvedValue: 0,
          pendingValue: 0,
        }
        byUser.set(uid, row)
      }
      row.leaves.push(l)
      if (l.status === 'approved') row.approvedValue += dayValue(l)
      else if (l.status === 'pending') row.pendingValue += dayValue(l)
    }
    const all = Array.from(byUser.values())
    all.forEach(r => r.leaves.sort((a, b) => a.date.localeCompare(b.date)))
    return all.sort((a, b) => b.approvedValue - a.approvedValue || a.name.localeCompare(b.name))
  }, [leaves])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r =>
      (dept === 'all' || r.department === dept) &&
      (q === '' || r.name.toLowerCase().includes(q)),
    )
  }, [rows, dept, search])

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.users += 1
        acc.approved += r.approvedValue
        acc.pending += r.pendingValue
        return acc
      },
      { users: 0, approved: 0, pending: 0 },
    )
  }, [filtered])

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search user…"
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 w-48"
          />
        </div>
        <select
          value={dept}
          onChange={e => setDept(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
        >
          <option value="all">All departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        {/* Totals chip */}
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
          <Users size={13} />
          <span><strong className="text-gray-800">{totals.users}</strong> users</span>
          <span>·</span>
          <span><strong className="text-teal-700">{fmtVal(totals.approved)}</strong> approved days</span>
          {totals.pending > 0 && <><span>·</span><span><strong className="text-amber-600">{fmtVal(totals.pending)}</strong> pending</span></>}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th className="text-left py-3 px-4">User</th>
              <th className="text-left py-3 px-4">Department</th>
              <th className="text-left py-3 px-4">Dates ({monthLabel})</th>
              <th className="text-right py-3 px-4">Approved</th>
              <th className="text-right py-3 px-4">Pending</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-sm text-gray-400">No leaves match the filters.</td></tr>
            ) : filtered.map(r => (
              <tr key={r.userId} className="hover:bg-gray-50 align-top">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2.5">
                    {r.avatar ? (
                      <img src={r.avatar} alt={r.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                        {initials(r.name)}
                      </div>
                    )}
                    <span className="text-sm font-medium text-gray-900">{r.name}</span>
                  </div>
                </td>
                <td className="py-3 px-4 text-sm text-gray-600">{r.department}</td>
                <td className="py-3 px-4">
                  <div className="flex flex-wrap gap-1">
                    {r.leaves.map(l => (
                      <span
                        key={l.id}
                        title={`${l.leave_type}${l.is_half_day ? ' (half day)' : ''} — ${l.status}${l.note ? ` — ${l.note}` : ''}`}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${
                          l.leave_type === 'sick' ? 'bg-orange-50 text-orange-700' : 'bg-sky-50 text-sky-700'
                        } ${l.status === 'pending' ? 'ring-1 ring-amber-300' : ''}`}
                      >
                        {fmtDay(l.date)}{l.is_half_day ? ' ½' : ''}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-3 px-4 text-right text-sm font-semibold text-teal-700">{fmtVal(r.approvedValue)}</td>
                <td className="py-3 px-4 text-right text-sm text-amber-600">{r.pendingValue > 0 ? fmtVal(r.pendingValue) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        “Approved” is the leave value counted for the month (half-days = 0.5). Pending requests are shown until an admin approves or rejects them.
      </p>
    </div>
  )
}
