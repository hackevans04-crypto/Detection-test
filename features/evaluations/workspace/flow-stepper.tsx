'use client'

import Link from 'next/link'
import { Check } from 'lucide-react'
import { stepIds, stepShortLabels, type StepId, type StepStatus } from '@/lib/evaluations/model'

/**
 * Barra de proceso de la evaluación.
 *
 * Diez etapas en horizontal: la selección del evaluado y las nueve del
 * expediente. Es la misma barra durante la creación y durante la edición, así
 * que el profesional ve siempre el proceso completo y dónde está dentro de él
 * —incluso antes de que la evaluación exista—.
 *
 * Nunca bloquea: se puede saltar a cualquier etapa ya alcanzable. El orden lo
 * decide el caso, no el software; la barra sólo informa de qué falta.
 */

export type FlowStep = {
  key: string
  label: string
  status: StepStatus
  href?: string
}

/** Las diez etapas visibles, con «Selección» delante de las nueve del modelo. */
export const flowLabels: string[] = ['Selección', ...stepIds.map((id) => stepShortLabels[id])]

/** Índice en la barra de una etapa del expediente. La 0 es la selección. */
export function flowIndexOf(step: StepId) {
  return stepIds.indexOf(step) + 1
}

export function FlowStepper({ steps, ariaLabel = 'Etapas de la evaluación' }: { steps: FlowStep[]; ariaLabel?: string }) {
  return (
    <ol className="dt-flow" aria-label={ariaLabel}>
      {steps.map((step, index) => {
        const content = (
          <>
            <span className="dt-flow-track">
              <i className="dt-flow-line" data-side="left" data-hidden={index === 0} aria-hidden="true" />
              <span className="dt-flow-mark" aria-hidden="true">
                {step.status === 'COMPLETED' ? <Check /> : index + 1}
              </span>
              <i className="dt-flow-line" data-side="right" data-hidden={index === steps.length - 1} aria-hidden="true" />
            </span>
            <span className="dt-flow-label">{step.label}</span>
          </>
        )

        const current = step.status === 'IN_PROGRESS'
        const label = `${index + 1}. ${step.label}${step.status === 'COMPLETED' ? ' (completada)' : ''}`

        return (
          <li key={step.key} style={{ display: 'flex', flex: '1 0 44px', minWidth: 0 }}>
            {step.href ? (
              <Link
                href={step.href}
                className="dt-flow-step"
                data-status={step.status}
                aria-current={current ? 'step' : undefined}
                title={step.label}
                aria-label={label}
              >
                {content}
              </Link>
            ) : (
              <span
                className="dt-flow-step"
                data-status={step.status}
                data-interactive="false"
                aria-current={current ? 'step' : undefined}
                title={step.label}
                aria-label={label}
              >
                {content}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Barra durante la creación, cuando todavía no hay expediente que enlazar:
 * lo anterior al paso activo está hecho y lo posterior, pendiente.
 */
export function CreationFlowStepper({ activeIndex }: { activeIndex: number }) {
  return (
    <FlowStepper
      steps={flowLabels.map((label, index) => ({
        key: label,
        label,
        status: index < activeIndex ? 'COMPLETED' : index === activeIndex ? 'IN_PROGRESS' : 'PENDING',
      }))}
    />
  )
}
