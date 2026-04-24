import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-center space-y-4">
        <p className="text-7xl font-black text-gray-200 dark:text-gray-800">404</p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Page not found</h1>
        <p className="text-gray-500">The page you're looking for doesn't exist.</p>
        <Link
          href="/dashboard"
          className="inline-block px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
