'use client'

import { Check, CircleDashed, Clock3, FileCheck2 } from 'lucide-react'
import type { EvaluationStatus, StepStatus } from '@/lib/evaluations/model'
import { statusLabels } from '@/lib/evaluations/progress'
import { initialsOf } from '@/lib/evaluations/format'
import { identityColor } from '@/lib/evaluations/identity-color'

const statusTone: Record<EvaluationStatus, 'neutral' | 'primary' | 'warning' | 'success'> = {
  DRAFT: 'neutral',
  IN_PROGRESS: 'primary',
  READY_FOR_REVIEW: 'warning',
  COMPLETED: 'success',
}

const statusIcon: Record<EvaluationStatus, typeof Check> = {
  DRAFT: CircleDashed,
  IN_PROGRESS: Clock3,
  READY_FOR_REVIEW: FileCheck2,
  COMPLETED: Check,
}

/**
 * El estado se comunica con icono + texto, nunca sólo con color: el requisito
 * de accesibilidad prohíbe que el color sea el único portador del significado.
 */
export function EvaluationStatusBadge({ status }: { status: EvaluationStatus }) {
  const Icon = statusIcon[status]
  return (
    <span className="dt-badge" data-tone={statusTone[status]}>
      <Icon aria-hidden="true" />
      {statusLabels[status]}
    </span>
  )
}

export function EvaluationProgressBar({
  percent,
  label,
  tone,
  color,
}: {
  percent: number
  label?: string
  tone?: 'success' | 'warning'
  /** Color explícito, para las listas que usan el color de identidad. */
  color?: string
}) {
  return (
    <div>
      <div
        className="dt-progress"
        data-tone={tone}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `Progreso ${percent}%`}
      >
        <span style={{ width: `${percent}%`, background: color }} />
      </div>
    </div>
  )
}

/**
 * Avatar de una persona evaluada. Toma el color de identidad para que la misma
 * persona se reconozca de un vistazo entre las listas del inicio.
 */
export function Avatar({
  name,
  size = 'md',
  identity = true,
}: {
  name: string
  size?: 'sm' | 'md' | 'lg'
  identity?: boolean
}) {
  const initials = initialsOf(name)
  const color = identity ? identityColor(name) : null
  return (
    <span
      className="dt-avatar"
      data-size={size}
      style={color ? { background: color.solid, color: '#fff' } : undefined}
      aria-hidden="true"
    >
      {initials || '—'}
    </span>
  )
}

const stepStatusLabels: Record<StepStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En progreso',
  COMPLETED: 'Completada',
}

export function stepStatusLabel(status: StepStatus) {
  return stepStatusLabels[status]
}
