'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export interface PerformanceTrendPoint {
  label: string
  score: number
  possible: number
  completion: number
  completedTasks: number
  totalTasks: number
  rank: number | null
  hasData: boolean
}

interface Props {
  data: PerformanceTrendPoint[]
}

export default function PerformanceTrendChart({ data }: Props) {
  if (data.every(point => !point.hasData)) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm font-medium text-gray-400">
        No monthly score data yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="score" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="completion" orientation="right" domain={[0, 100]} hide />
        <Tooltip
          cursor={{ fill: '#f8fafc' }}
          contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
          formatter={(value, name, item) => {
            const payload = item.payload as PerformanceTrendPoint
            if (!payload.hasData) return ['No data', 'Status']
            if (name === 'score') return [`${value} / ${payload.possible} pts`, 'Score']
            if (name === 'completion') return [`${Number(value).toFixed(0)}%`, 'Completion']
            return [value, name]
          }}
          labelFormatter={(label, items) => {
            const payload = items?.[0]?.payload as PerformanceTrendPoint | undefined
            if (!payload?.hasData) return `${label} - no data`
            const rank = payload.rank ? ` - Rank #${payload.rank}` : ''
            return `${label}${rank} - ${payload.completedTasks}/${payload.totalTasks} tasks`
          }}
        />
        <Bar yAxisId="score" dataKey="score" radius={[6, 6, 0, 0]} fill="#3b82f6" maxBarSize={34} />
        <Line
          yAxisId="completion"
          type="monotone"
          dataKey="completion"
          stroke="#8b5cf6"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={{ r: 3, fill: '#8b5cf6', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

