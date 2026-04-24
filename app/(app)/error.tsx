'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle size={24} className="text-red-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Something went wrong</h2>
          <p className="text-sm text-gray-500 mt-1">{error.message ?? 'An unexpected error occurred'}</p>
        </div>
        <button
          onClick={reset}
          className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
