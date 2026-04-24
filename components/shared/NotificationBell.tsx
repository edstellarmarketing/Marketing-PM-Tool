'use client'

import { Bell } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function NotificationBell() {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    async function fetchUnread() {
      const supabase = createClient()
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('read', false)
      setUnread(count ?? 0)
    }
    fetchUnread()
  }, [])

  return (
    <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
      <Bell size={20} className="text-gray-600" />
      {unread > 0 && (
        <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center leading-none">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  )
}
