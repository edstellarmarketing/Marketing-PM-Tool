'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface Props {
  month: number
  year: number
}

export default function MonthSelector({ month, year }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function navigate(m: number, y: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', String(m))
    params.set('year', String(y))
    router.push(`${pathname}?${params.toString()}`)
  }

  function prev() {
    if (month === 1) navigate(12, year - 1)
    else navigate(month - 1, year)
  }

  function next() {
    const now = new Date()
    const maxMonth = now.getMonth() + 4 // allow 3 months ahead
    const maxYear = now.getFullYear() + (now.getMonth() >= 9 ? 1 : 0)
    const nextM = month === 12 ? 1 : month + 1
    const nextY = month === 12 ? year + 1 : year
    if (nextY > maxYear || (nextY === maxYear && nextM > (maxMonth % 12 || 12))) return
    navigate(nextM, nextY)
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={prev} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
        <ChevronLeft size={18} className="text-gray-600" />
      </button>
      <span className="text-lg font-semibold text-gray-900 w-36 text-center">
        {MONTHS[month - 1]} {year}
      </span>
      <button onClick={next} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
        <ChevronRight size={18} className="text-gray-600" />
      </button>
    </div>
  )
}
