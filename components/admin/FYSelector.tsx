'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface Props {
  currentFy: string
  options: string[]
}

export default function FYSelector({ currentFy, options }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(fy: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('fy', fy)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-500">FY</label>
      <select
        value={currentFy}
        onChange={e => handleChange(e.target.value)}
        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  )
}
