'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface Props {
  currentFy: string
  options: string[]
}

export default function FinancialYearSelector({ currentFy, options }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(financialYear: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('fy', financialYear)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="performance-fy" className="text-sm font-medium text-gray-500">
        Financial year
      </label>
      <select
        id="performance-fy"
        value={currentFy}
        onChange={event => handleChange(event.target.value)}
        className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        {options.map(option => (
          <option key={option} value={option}>
            FY {option}
          </option>
        ))}
      </select>
    </div>
  )
}

