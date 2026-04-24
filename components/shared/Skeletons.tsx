export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded mt-1 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
          <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-1/2" />
          <div className="flex gap-2 mt-3">
            <div className="h-5 w-14 bg-gray-100 dark:bg-gray-700 rounded-full" />
            <div className="h-5 w-16 bg-gray-100 dark:bg-gray-700 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function SkeletonStatCard() {
  return (
    <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-7 w-10 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
      <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded mt-3" />
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl">
          <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
            <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-1/4" />
          </div>
          <div className="h-6 w-20 bg-gray-100 dark:bg-gray-700 rounded-full" />
        </div>
      ))}
    </div>
  )
}
