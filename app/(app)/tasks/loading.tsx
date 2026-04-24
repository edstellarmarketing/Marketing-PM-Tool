import { SkeletonCard } from '@/components/shared/Skeletons'

export default function TasksLoading() {
  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between animate-pulse">
        <div className="h-7 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-9 w-28 bg-gray-200 dark:bg-gray-700 rounded-lg" />
      </div>
      <div className="flex gap-3 animate-pulse">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-8 w-32 bg-gray-100 dark:bg-gray-700 rounded-lg" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )
}
