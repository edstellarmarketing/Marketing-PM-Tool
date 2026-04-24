'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function KeyboardShortcuts() {
  const router = useRouter()

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        router.push('/tasks/new')
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [router])

  return null
}
