'use client'

import { useState } from 'react'
import { Award } from 'lucide-react'
import GiveAwardModal, { type TaskOption } from './GiveAwardModal'

interface Props {
  userId: string
  userName: string
  taskId?: string
  taskTitle?: string
  tasks?: TaskOption[]
}

export default function GiveAwardButton({ userId, userName, taskId, taskTitle, tasks }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 border border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium rounded-lg hover:bg-amber-100 transition-colors"
      >
        <Award size={14} /> Give Award
      </button>
      {open && (
        <GiveAwardModal
          userId={userId}
          userName={userName}
          taskId={taskId}
          taskTitle={taskTitle}
          tasks={tasks}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
