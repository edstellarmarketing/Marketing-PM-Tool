import { Lock } from 'lucide-react'
import Link from 'next/link'

// Shown to a signed-in user who has no `expenses` grant.
//
// Deliberately an explicit refusal rather than the 404 the module used before:
// the sidebar entry is hidden from people without access, so the only way to
// land here is a link someone sent you — at which point "this does not exist"
// is unhelpful and "ask so-and-so" is not.
export default function ExpensesNoAccess() {
  return (
    <div className="max-w-lg mx-auto mt-16">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 text-center shadow-sm">
        <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
          <Lock size={20} className="text-gray-400" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">No access</h1>
        <p className="text-sm text-gray-500 mt-2">
          Permission required. Expenses is a restricted module — access is granted
          per person, and your account does not have it.
        </p>
        <p className="text-sm text-gray-500 mt-3">
          If you need it, ask <span className="font-medium text-gray-700 dark:text-gray-300">Vijay</span> to
          add you as a viewer or a ledger manager.
        </p>
        <Link
          href="/dashboard"
          className="inline-block mt-6 px-5 py-2 bg-gray-900 dark:bg-blue-600 hover:bg-gray-800 dark:hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
