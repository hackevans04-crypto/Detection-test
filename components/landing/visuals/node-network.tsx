'use client'

import { cn } from '@/lib/utils'

// Deterministic node layout (no randomness -> no hydration mismatch).
const NODES = [
  { id: 0, x: 200, y: 40 },
  { id: 1, x: 300, y: 90 },
  { id: 2, x: 120, y: 120 },
  { id: 3, x: 240, y: 160 },
  { id: 4, x: 340, y: 200 },
  { id: 5, x: 160, y: 220 },
  { id: 6, x: 260, y: 260 },
  { id: 7, x: 90, y: 280 },
  { id: 8, x: 200, y: 320 },
  { id: 9, x: 320, y: 330 },
  { id: 10, x: 150, y: 360 },
  { id: 11, x: 250, y: 380 },
]

const EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [1, 3], [1, 4], [2, 3], [2, 5],
  [3, 4], [3, 6], [4, 9], [5, 6], [5, 7], [6, 8], [6, 9],
  [7, 8], [7, 10], [8, 10], [8, 11], [9, 11], [10, 11],
]

type NodeNetworkProps = {
  className?: string
  animated?: boolean
}

/** Reusable animated neural-network SVG. Cyan/blue lines with traveling pulses. */
export function NodeNetwork({ className, animated = true }: NodeNetworkProps) {
  return (
    <svg
      viewBox="0 0 400 420"
      className={cn('h-full w-full', className)}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="nn-line" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0879f9" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#09c6d9" stopOpacity="0.5" />
        </linearGradient>
        <radialGradient id="nn-node" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#45d9e7" />
          <stop offset="100%" stopColor="#0879f9" />
        </radialGradient>
      </defs>

      {EDGES.map(([a, b], i) => {
        const na = NODES[a]
        const nb = NODES[b]
        return (
          <line
            key={`e-${i}`}
            x1={na.x}
            y1={na.y}
            x2={nb.x}
            y2={nb.y}
            stroke="url(#nn-line)"
            strokeWidth="1.2"
            strokeOpacity="0.55"
            strokeDasharray={animated ? '4 8' : undefined}
            style={
              animated
                ? { animation: `dash-move ${6 + (i % 5)}s linear infinite` }
                : undefined
            }
          />
        )
      })}

      {NODES.map((n, i) => (
        <g key={`n-${n.id}`}>
          {animated && (
            <circle
              cx={n.x}
              cy={n.y}
              r="6"
              fill="#09c6d9"
              opacity="0.5"
              style={{
                transformOrigin: `${n.x}px ${n.y}px`,
                animation: `pulse-ring ${3 + (i % 4)}s ease-out infinite`,
                animationDelay: `${(i % 6) * 0.4}s`,
              }}
            />
          )}
          <circle cx={n.x} cy={n.y} r="3.4" fill="url(#nn-node)" />
        </g>
      ))}
    </svg>
  )
}
