'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { MonthlyScore } from '@/types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface Props {
  scores: MonthlyScore[]
}

export default function ScoreHistoryChart({ scores }: Props) {
  const data = [...scores]
    .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
    .map(s => ({
      name: `${MONTHS[s.month - 1]} ${String(s.year).slice(2)}`,
      score: s.score_earned,
      completion: Number(s.completion_rate),
    }))

  if (data.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-6">No score history yet</p>
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          formatter={(value, name) => [
            name === 'score' ? `${value} pts` : `${value}%`,
            name === 'score' ? 'Score' : 'Completion',
          ]}
        />
        <ReferenceLine y={0} stroke="#e5e7eb" />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 3, fill: '#3b82f6' }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="completion"
          stroke="#a78bfa"
          strokeWidth={2}
          strokeDasharray="4 2"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
