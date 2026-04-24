'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, List, Target } from 'lucide-react'
import AdminAttendanceCalendar from '@/components/attendance/AdminAttendanceCalendar'
import AdminAttendanceList from '@/components/attendance/AdminAttendanceList'
import AdminPendingLeaves from '@/components/attendance/AdminPendingLeaves'
import AwardBonusModal from '@/components/attendance/AwardBonusModal'
import type { AttendanceLeave } from '@/types'

interface LeaveWithProfile extends AttendanceLeave {
  profiles: { id: string; full_name: string; avatar_url: string | null } | null
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function prevMonth(month: number, year: number) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year }
}

function nextMonthNav(month: number, year: number) {
  return month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year }
}

export default function AdminAttendancePage() {
  const now = new Date()
  const [month,       setMonth]       = useState(now.getMonth() + 1)
  const [year,        setYear]        = useState(now.getFullYear())
  const [view,        setView]        = useState<'calendar' | 'list'>('calendar')
  const [leaves,      setLeaves]      = useState<LeaveWithProfile[]>([])
  const [pendingAll,  setPendingAll]  = useState<LeaveWithProfile[]>([])
  const [members,     setMembers]     = useState<number>(0)
  const [loading,     setLoading]     = useState(true)
  const [showModal,   setShowModal]   = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [leavesRes, pendingRes, membersRes] = await Promise.all([
        fetch(`/api/attendance/admin?month=${month}&year=${year}`),
        fetch('/api/attendance/admin?status=pending'),
        fetch('/api/profiles/active'),
      ])
      const leavesData  = await leavesRes.json()
      const pendingData = await pendingRes.json()
      const membersData = await membersRes.json()
      setLeaves(Array.isArray(leavesData)  ? leavesData  : [])
      setPendingAll(Array.isArray(pendingData) ? pendingData : [])
      setMembers(Array.isArray(membersData) ? membersData.length : 0)
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { fetchData() }, [fetchData])

  function goTo(m: number, y: number) {
    setMonth(m)
    setYear(y)
  }

  // When admin approves/rejects a leave, update both lists optimistically
  function handleStatusChange(id: string, status: 'approved' | 'rejected') {
    setLeaves(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    setPendingAll(prev => prev.filter(l => l.id !== id))
  }

  const prev = prevMonth(month, year)
  const next = nextMonthNav(month, year)

  // Only count approved leaves in the stats
  const approvedLeaves = leaves.filter(l => l.status === 'approved')
  const sickCount     = approvedLeaves.filter(l => l.leave_type === 'sick').length
  const casualCount   = approvedLeaves.filter(l => l.leave_type === 'casual').length
  const usersAbsent   = new Set(approvedLeaves.map(l => l.user_id)).size
  const perfectUsers  = members - usersAbsent

  const sortedLeaves = [...leaves].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    return (a.profiles?.full_name ?? '').localeCompare(b.profiles?.full_name ?? '')
  })

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Attendance</h1>
          <p className="text-sm text-gray-400 mt-0.5">Monthly absence overview and leave approvals</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Month nav */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
            <button onClick={() => goTo(prev.month, prev.year)}
              className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold text-gray-700 min-w-[90px] text-center">
              {MONTH_NAMES[month - 1].slice(0, 3)} {year}
            </span>
            <button onClick={() => goTo(next.month, next.year)}
              className="p-1 text-gray-400 hover:text-gray-700 rounded transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
            <button onClick={() => setView('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                view === 'calendar' ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <CalendarDays size={13} /> Calendar
            </button>
            <button onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                view === 'list' ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <List size={13} /> List
            </button>
          </div>

          {/* Award button */}
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors">
            <Target size={14} /> Award Bonus
          </button>
        </div>
      </div>

      {/* Pending approvals — always visible when there are pending requests */}
      {pendingAll.length > 0 && (
        <AdminPendingLeaves
          leaves={pendingAll}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Summary strip (approved only) */}
      <div className="flex flex-wrap gap-3">
        {[
          { emoji: '🏖', count: approvedLeaves.length, label: 'Absence Days' },
          { emoji: '🤒', count: sickCount,              label: 'Sick Days'    },
          { emoji: '🌴', count: casualCount,            label: 'Casual Days'  },
          { emoji: '🎯', count: perfectUsers,           label: 'Perfect Users'},
        ].map(stat => (
          <div key={stat.label} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2">
            <span className="text-lg">{stat.emoji}</span>
            <span className="text-lg font-bold text-gray-900">{stat.count}</span>
            <span className="text-xs text-gray-400">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 flex items-center justify-center">
          <div className="text-sm text-gray-400">Loading…</div>
        </div>
      ) : view === 'calendar' ? (
        <AdminAttendanceCalendar year={year} month={month} leaves={sortedLeaves} />
      ) : (
        <AdminAttendanceList
          leaves={sortedLeaves}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Award bonus modal */}
      {showModal && (
        <AwardBonusModal
          month={month}
          year={year}
          totalMembers={members}
          onClose={() => setShowModal(false)}
          onSuccess={fetchData}
        />
      )}
    </div>
  )
}
