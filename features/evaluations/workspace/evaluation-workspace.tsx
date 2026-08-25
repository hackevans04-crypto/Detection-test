'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import {
  Avatar,
  EvaluationProgressBar,
  EvaluationStatusBadge,
} from '@/features/evaluations/components/evaluation-bits'
import { FlowStepper, flowLabels } from '@/features/evaluations/workspace/flow-stepper'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { stepIds, stepLabels, type StepId } from '@/lib/evaluations/model'
import { ageAt, formatAgeShort, orDash } from '@/lib/evaluations/format'
import { evaluationProgress, stepStatus } from '@/lib/evaluations/progress'

/**
 * Marco del expediente abierto.
 *
 * La identidad del evaluado y el proceso caben en una sola tarjeta de cabecera:
 * quién, en qué estado, cuánto lleva y en qué etapa está. Todo lo demás de la
 * pantalla es el formulario de la etapa, que es a lo que se viene.
 */
export function EvaluationWorkspaceLayout({ children }: { children: ReactNode }) {
  const { evaluation } = useEvaluation()
  const pathname = usePathname()
  const segment = pathname.split('/')[3] ?? 'datos-iniciales'
  const current = (stepIds.includes(segment as StepId) ? segment : 'datos-iniciales') as StepId
  const name = orDash(evaluation.initialData.person.fullName, 'Evaluación sin nombre')
  const progress = evaluationProgress(evaluation)

  const identity = [
    formatAgeShort(ageAt(evaluation.initialData.person.birthDate, evaluation.initialData.evaluationDate)),
    evaluation.initialData.person.grade,
    evaluation.initialData.person.sex,
  ]
    .filter(Boolean)
    .join(' · ')

  // La etapa 0 de la barra es la selección del evaluado: en un expediente que
  // ya existe siempre está hecha, porque sin ella no habría expediente.
  const steps = [
    { key: 'seleccion', label: flowLabels[0], status: 'COMPLETED' as const },
    ...stepIds.map((id, index) => ({
      key: id,
      label: flowLabels[index + 1],
      status: id === current ? ('IN_PROGRESS' as const) : stepStatus(evaluation, id),
      href: `/evaluaciones/${evaluation.id}/${id}`,
    })),
  ]

  return (
    <>
      <PageHeader
        above={
          <nav className="dt-breadcrumb mb-2" aria-label="Ruta de navegación">
            <Link href="/evaluaciones">
              <ArrowLeft className="inline size-3.5 align-[-2px]" aria-hidden="true" /> Evaluaciones
            </Link>
            <ChevronRight aria-hidden="true" />
            <span aria-current="page">{name}</span>
          </nav>
        }
        title={name}
        description={`${evaluation.code} · ${stepLabels[current]}`}
      />

      <div className="dt-page">
        <section className="dt-card dt-flowbar" aria-label="Proceso de evaluación">
          <div className="dt-flowbar-top">
            <div className="dt-flowbar-identity">
              <Avatar name={name} size="sm" />
              <div className="min-w-0">
                <strong>{name}</strong>
                <small>
                  {evaluation.code}
                  {identity ? ` · ${identity}` : ''}
                </small>
              </div>
            </div>
            <EvaluationStatusBadge status={evaluation.status} />
            <div className="dt-flowbar-progress">
              <EvaluationProgressBar
                percent={progress.percent}
                label="Progreso general de la evaluación"
                tone={progress.percent === 100 ? 'success' : undefined}
              />
              <span className="dt-flowbar-percent">
                {progress.percent}% · {progress.completedSteps}/{progress.totalSteps}
              </span>
            </div>
          </div>

          <FlowStepper steps={steps} />
        </section>

        {children}
      </div>
    </>
  )
}

/** Contenedor de una etapa: título, ayuda y cuerpo. */
export function StepCard({
  step,
  title,
  description,
  aside,
  children,
}: {
  step: StepId
  title?: string
  description?: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="dt-card dt-card-pad" aria-labelledby={`step-${step}-title`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id={`step-${step}-title`} className="text-lg font-bold tracking-tight" style={{ color: 'var(--dt-text)' }}>
            {title ?? stepLabels[step]}
          </h2>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm" style={{ color: 'var(--dt-muted)' }}>
              {description}
            </p>
          ) : null}
        </div>
        {aside}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  )
}
