'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useReactToPrint } from 'react-to-print'
import { Printer, Eye, EyeOff, Loader2 } from 'lucide-react'
import PrintableAppraisal from './PrintableAppraisal'
import type { AppraisalSnapshot, Profile, MonthlyScore, CategoryStat, Task, UserAward } from '@/types'

interface Props {
  snapshot: AppraisalSnapshot
  profile: Profile
  monthlyScores: MonthlyScore[]
  userId: string
  categoryStats: CategoryStat[]
  tasks?: Task[]
  awards?: UserAward[]
  attendanceLeaves?: Array<{ date: string; leave_type: string }>
}

export default function AppraisalActions({ snapshot, profile, monthlyScores, userId, categoryStats, tasks, awards, attendanceLeaves }: Props) {
  const router = useRouter()
  const printRef = useRef<HTMLDivElement>(null)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Appraisal_${profile.full_name.replace(/\s+/g, '_')}_FY${snapshot.financial_year}`,
  })

  async function togglePublish() {
    setPublishing(true)
    setError(null)
    const res = await fetch(`/api/admin/appraisals/${userId}/publish`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        financial_year: snapshot.financial_year,
        published: !snapshot.published,
      }),
    })
    setPublishing(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed')
      return
    }
    router.refresh()
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => handlePrint()}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Printer size={15} /> Export PDF
        </button>
        <button
          onClick={togglePublish}
          disabled={publishing}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
            snapshot.published
              ? 'border border-gray-200 text-gray-700 hover:bg-gray-50'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {publishing ? <Loader2 size={15} className="animate-spin" /> : snapshot.published ? <EyeOff size={15} /> : <Eye size={15} />}
          {publishing ? 'Saving…' : snapshot.published ? 'Unpublish' : 'Publish to Member'}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {/* Off-screen print target — must be rendered (not display:none) for react-to-print to capture layout */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0, width: '1100px' }}>
        <div ref={printRef}>
          <PrintableAppraisal
            snapshot={snapshot}
            profile={profile}
            monthlyScores={monthlyScores}
            categoryStats={categoryStats}
            tasks={tasks}
            awards={awards}
            attendanceLeaves={attendanceLeaves}
          />
        </div>
      </div>
    </>
  )
}
