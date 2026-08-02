'use client'

import { useMemo, useRef, useState } from 'react'

interface Point { year: number; month: number; label: string; total: number; net: number }

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Geometry. The height includes the x-axis band so the card never needs a nested
// scrollbar to show the tick labels.
const W = 720
const H = 240
// right is sized for the endpoint's direct label (up to "$999,999" at 11px),
// so the one label on the chart is never clipped or pushed off the viewBox.
const PAD = { top: 18, right: 78, bottom: 28, left: 56 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

// Clean ticks whose top sits just above the data. Candidate steps are tried and
// the one giving the tightest axis with a sensible tick count wins — a step of
// 2000 for a $6,192 peak would top the axis at $8k and leave a third of the plot
// empty.
function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0]
  const mag = Math.pow(10, Math.floor(Math.log10(max / target)))
  const candidates = [1, 1.5, 2, 2.5, 3, 4, 5, 10].map(m => m * mag)

  let best: number[] | null = null
  for (const step of candidates) {
    const top = Math.ceil(max / step) * step
    const n = Math.round(top / step) + 1
    if (n < 3 || n > 7) continue
    if (!best || top < best[best.length - 1]) {
      best = Array.from({ length: n }, (_, i) => Math.round(i * step * 100) / 100)
    }
  }
  // Fallback: a single step that certainly covers max.
  return best ?? [0, Math.ceil(max)]
}

// Axis ticks only — one decimal below $10k so $6.2k never reads as $6k.
const compact = (n: number) => {
  const a = Math.abs(n)
  if (a >= 10_000) return `$${Math.round(n / 1000)}k`
  if (a >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Math.round(n)}`
}
// The one direct label carries a real value, so it is not abbreviated at all.
const exact = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const full = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

// One series → no legend box (the heading says what is plotted). Turn on the
// prior-period comparison and it becomes two series, at which point a legend is
// mandatory — identity must never rest on colour alone.
export default function SpendTrend({
  points, useNet, prior,
}: {
  points: Point[]
  useNet: boolean
  prior?: Point[] | null
}) {
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const values = points.map(p => (useNet ? p.net : p.total))
  const priorValues = prior?.map(p => (useNet ? p.net : p.total)) ?? null
  // Both series share ONE scale. Giving the comparison its own axis would invent
  // a relationship that isn't in the data — the single worst chart mistake.
  const max = Math.max(0, ...values, ...(priorValues ?? []))
  const ticks = useMemo(() => niceTicks(max), [max])
  const yMax = ticks[ticks.length - 1] || 1

  const x = (i: number) => PAD.left + (points.length <= 1 ? PLOT_W / 2 : (i / (points.length - 1)) * PLOT_W)
  const y = (v: number) => PAD.top + PLOT_H - (v / yMax) * PLOT_H

  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const lastIdx = values.length - 1
  const peakIdx = values.indexOf(Math.max(...values))

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || points.length === 0) return
    // Map client px into viewBox units so hover works at any rendered width.
    const vx = ((e.clientX - rect.left) / rect.width) * W
    const ratio = (vx - PAD.left) / PLOT_W
    const idx = Math.round(ratio * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, idx)))
  }

  const hoveredValue = hover === null ? null : values[hover]

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Total spend for the last ${points.length} months`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Gridlines — solid hairlines, one step off the surface, recessive */}
        {ticks.map(t => (
          <g key={t}>
            <line
              x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
              stroke="var(--viz-grid)" strokeWidth={1} shapeRendering="crispEdges"
            />
            <text
              x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle"
              fill="var(--viz-muted)" fontSize={11} style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {compact(t)}
            </text>
          </g>
        ))}

        {/* x-axis labels — every other month so they never collide */}
        {points.map((p, i) => (
          (i % 2 === points.length % 2 || i === lastIdx) && (
            <text
              key={p.label} x={x(i)} y={H - 8} textAnchor="middle"
              fill="var(--viz-muted)" fontSize={11}
            >
              {MONTH_ABBR[p.month - 1]}{p.month === 1 || i === 0 ? ` ’${String(p.year).slice(2)}` : ''}
            </text>
          )
        ))}

        {/* Area wash at ~10% under the line */}
        {values.length > 1 && (
          <path
            d={`${path} L${x(lastIdx)},${y(0)} L${x(0)},${y(0)} Z`}
            fill="var(--viz-accent)" opacity={0.1}
          />
        )}

        {/* Prior period, drawn first so the current series reads on top */}
        {priorValues && priorValues.length > 1 && (
          <path
            d={priorValues.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
            fill="none" stroke="var(--viz-compare)" strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round"
          />
        )}

        {/* The series — 2px, round join/cap */}
        <path d={path} fill="none" stroke="var(--viz-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Crosshair on hover */}
        {hover !== null && (
          <line
            x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + PLOT_H}
            stroke="var(--viz-baseline)" strokeWidth={1} shapeRendering="crispEdges"
          />
        )}

        {/* Peak marker, only when it is not the endpoint — 8px with a 2px surface ring */}
        {peakIdx !== lastIdx && values.length > 1 && (
          <circle cx={x(peakIdx)} cy={y(values[peakIdx])} r={4}
            fill="var(--viz-accent)" stroke="var(--viz-surface)" strokeWidth={2} />
        )}

        {/* Endpoint marker + the one direct label */}
        {values.length > 0 && (
          <>
            <circle cx={x(lastIdx)} cy={y(values[lastIdx])} r={4.5}
              fill="var(--viz-accent)" stroke="var(--viz-surface)" strokeWidth={2} />
            {(() => {
              const text = exact(values[lastIdx])
              // ~6.2px per glyph at 11px in the UI sans; if it would not clear the
              // right edge, flip it to the left of the marker rather than clip it.
              const estWidth = text.length * 6.2
              const fits = x(lastIdx) + 9 + estWidth <= W - 2
              return (
                <text
                  x={fits ? x(lastIdx) + 9 : x(lastIdx) - 9}
                  y={y(values[lastIdx])}
                  textAnchor={fits ? 'start' : 'end'}
                  dominantBaseline="middle" fontSize={11} fontWeight={600}
                  fill="var(--viz-ink)"
                >
                  {text}
                </text>
              )
            })()}
          </>
        )}

        {/* Hovered point sits above the crosshair */}
        {hover !== null && (
          <circle cx={x(hover)} cy={y(values[hover])} r={4.5}
            fill="var(--viz-accent)" stroke="var(--viz-surface)" strokeWidth={2} />
        )}

        {/* Baseline */}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)}
          stroke="var(--viz-baseline)" strokeWidth={1} shapeRendering="crispEdges" />
      </svg>

      {/* Legend — mandatory once a second series is on screen */}
      {priorValues && prior && (
        <div className="flex items-center gap-4 mt-1 text-[11px] text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-[2px] rounded" style={{ background: 'var(--viz-accent)' }} />
            {points[0]?.year === points[points.length - 1]?.year
              ? points[0]?.year
              : `${points[0]?.year}–${points[points.length - 1]?.year}`}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-[2px] rounded" style={{ background: 'var(--viz-compare)' }} />
            Same months, a year earlier
          </span>
        </div>
      )}

      {/* Tooltip. Enhances only — every month is also readable in the matrix below. */}
      {hover !== null && hoveredValue !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-gray-900 dark:bg-gray-100 px-2.5 py-1.5 shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(hoveredValue) / H) * 100}%`, marginTop: -8 }}
        >
          <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {MONTH_ABBR[points[hover].month - 1]} {points[hover].year}
          </p>
          <p className="text-xs font-semibold text-white dark:text-gray-900 tabular-nums">
            {full(hoveredValue)}
          </p>
          {priorValues && (
            <p className="text-[11px] text-gray-300 dark:text-gray-600 tabular-nums mt-0.5">
              {full(priorValues[hover])} a year earlier
            </p>
          )}
        </div>
      )}
    </div>
  )
}
