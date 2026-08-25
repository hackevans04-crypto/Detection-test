'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileText,
  History,
  Plus,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { EmptyState, ErrorState, LoadingSkeleton, Skeleton } from '@/components/ui/states'
import { Avatar, EvaluationProgressBar, EvaluationStatusBadge } from '@/features/evaluations/components/evaluation-bits'
import { getInstrument } from '@/instruments/catalog'
import { useSession } from '@/lib/auth/session-context'
import { ageAt, formatAgeShort, formatUpdatedAt, orDash } from '@/lib/evaluations/format'
import { identityColor } from '@/lib/evaluations/identity-color'
import { stepShortLabels, type Evaluation, type StepId } from '@/lib/evaluations/model'
import { currentStageLabel, evaluationProgress, instrumentProgress, resumeStep } from '@/lib/evaluations/progress'
import { EvaluationStoreError, listEvaluations, subscribe } from '@/lib/evaluations/store'

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; evaluations: Evaluation[] }

function isActive(evaluation: Evaluation) {
  return evaluation.status === 'DRAFT' || evaluation.status === 'IN_PROGRESS'
}

/**
 * Los cuatro grupos del inicio son disjuntos a propósito: una evaluación
 * aparece en un sitio y sólo en uno, así los indicadores se pueden sumar sin
 * contar dos veces al mismo evaluado.
 */
function groupEvaluations(evaluations: Evaluation[]) {
  const active = evaluations.filter(isActive)
  const almostDone = active.filter((evaluation) => evaluationProgress(evaluation).pendingSteps.length === 1)
  const almostIds = new Set(almostDone.map((evaluation) => evaluation.id))
  return {
    inProgress: active.filter((evaluation) => !almostIds.has(evaluation.id)),
    almostDone,
    completed: evaluations.filter((evaluation) => evaluation.status === 'COMPLETED'),
    readyForReport: evaluations.filter((evaluation) => evaluation.status === 'READY_FOR_REVIEW'),
  }
}

function name(evaluation: Evaluation) {
  return orDash(evaluation.initialData.person.fullName, 'Evaluación sin nombre')
}

function meta(evaluation: Evaluation) {
  return [
    formatAgeShort(ageAt(evaluation.initialData.person.birthDate, evaluation.initialData.evaluationDate)),
    evaluation.initialData.person.grade,
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Etapa actual en dos líneas: el nombre corto arriba y qué falta dentro de ella
 * abajo. En instrumentos la segunda línea es el instrumento concreto y por
 * dónde va, que es la información que decide si merece la pena retomarla ahora.
 */
const stageSubtitles: Record<StepId, string> = {
  'datos-iniciales': 'Ficha del evaluado',
  motivo: 'Motivo y remitente',
  contexto: 'Antecedentes',
  areas: 'Selección de áreas',
  instrumentos: 'Aplicación pendiente',
  resultados: 'Interpretación',
  conclusiones: 'Redacción',
  recomendaciones: 'Pendiente revisión',
  informe: 'Validación y PDF',
}

function stageLines(evaluation: Evaluation) {
  const step = resumeStep(evaluation)
  const title = stepShortLabels[step]

  if (step !== 'instrumentos') return { title, detail: stageSubtitles[step] }

  const pending = Object.values(evaluation.instrumentApplications)
    .map((application) => ({ application, progress: instrumentProgress(application) }))
    .find((entry) => entry.progress.recorded < entry.progress.total)

  if (!pending) return { title, detail: stageSubtitles.instrumentos }
  const instrument = getInstrument(pending.application.instrumentId)
  if (!instrument) return { title, detail: stageSubtitles.instrumentos }
  return { title, detail: `${instrument.nombre} (${pending.progress.recorded}/${pending.progress.total})` }
}

export function EvaluationDashboard() {
  const { user } = useSession()
  const [state, setState] = useState<Load>({ kind: 'loading' })

  const load = useCallback(() => {
    listEvaluations(user.id)
      .then((evaluations) => setState({ kind: 'ready', evaluations }))
      .catch((error: unknown) =>
        setState({
          kind: 'error',
          message:
            error instanceof EvaluationStoreError
              ? error.message
              : 'No pudimos leer tus evaluaciones guardadas en este dispositivo.',
        }),
      )
  }, [user.id])

  useEffect(() => {
    load()
    return subscribe(load)
  }, [load])

  const greeting = user.name ? `¡Hola, ${user.name.split(' ')[0]}!` : '¡Hola!'

  return (
    <>
      <PageHeader
        title={greeting}
        description="Centro de trabajo para tus evaluaciones psicopedagógicas."
        actions={
          <Link href="/evaluaciones/nueva" className="dt-btn dt-btn-primary">
            <Plus aria-hidden="true" />
            Nueva evaluación
          </Link>
        }
      />

      <div className="dt-page">
        {state.kind === 'loading' ? (
          <div className="grid gap-5">
            <div className="dt-kpi-grid">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} style={{ height: 150 }} />
              ))}
            </div>
            <LoadingSkeleton rows={2} height={220} label="Cargando tus evaluaciones" />
          </div>
        ) : state.kind === 'error' ? (
          <div className="dt-card">
            <ErrorState description={state.message} onRetry={load} />
          </div>
        ) : (
          <DashboardContent evaluations={state.evaluations} />
        )}
      </div>
    </>
  )
}

function DashboardContent({ evaluations }: { evaluations: Evaluation[] }) {
  const groups = groupEvaluations(evaluations)
  const resume = [...evaluations]
    .filter((evaluation) => evaluation.status !== 'COMPLETED')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]

  if (evaluations.length === 0) {
    return (
      <div className="dt-home">
        <div className="dt-card">
          <EmptyState
            icon={ClipboardList}
            title="Aún no tienes evaluaciones"
            description="Crea la primera evaluación psicopedagógica para empezar a registrar el proceso: datos del evaluado, antecedentes, instrumentos e informe final."
            action={{ label: 'Nueva evaluación', href: '/evaluaciones/nueva' }}
          />
        </div>
        <QuickActions evaluations={evaluations} />
        <DashboardFooter />
      </div>
    )
  }

  return (
    <div className="dt-home">
      <section className="dt-kpi-grid" aria-label="Indicadores">
        <Kpi
          icon={ClipboardList}
          tone="blue"
          label="En proceso"
          value={groups.inProgress.length}
          hint="evaluaciones activas"
          href="/evaluaciones?estado=proceso"
        />
        <Kpi
          icon={Clock3}
          tone="amber"
          label="Por finalizar"
          value={groups.almostDone.length}
          hint="requieren completar"
          href="/evaluaciones?estado=porfinalizar"
        />
        <Kpi
          icon={ShieldCheck}
          tone="green"
          label="Finalizadas"
          value={groups.completed.length}
          hint="evaluaciones completas"
          href="/evaluaciones?estado=finalizadas"
        />
        <Kpi
          icon={FileText}
          tone="violet"
          label="Listas para informe"
          value={groups.readyForReport.length}
          hint="por generar PDF"
          href="/evaluaciones?estado=listas"
        />
      </section>

      <div className="dt-home-grid">
        <div className="dt-home-column">
          {resume ? <ResumeCard evaluation={resume} /> : null}
          <PendingCard evaluations={groups.almostDone} />
        </div>

        <div className="dt-home-column">
          <ListCard
            title="Evaluaciones en proceso"
            href="/evaluaciones?estado=proceso"
            evaluations={groups.inProgress}
            emptyIcon={ClipboardList}
            emptyTitle="No tienes evaluaciones en curso"
            emptyText="Todas tus evaluaciones están finalizadas o listas para informe."
          />
          <ListCard
            title="Evaluaciones finalizadas recientemente"
            href="/evaluaciones?estado=finalizadas"
            evaluations={groups.completed.slice(0, 4)}
            variant="completed"
            emptyIcon={ClipboardCheck}
            emptyTitle="Todavía no hay evaluaciones finalizadas"
            emptyText="Cuando completes las ocho etapas de un proceso y generes su informe, aparecerá aquí."
          />
        </div>
      </div>

      <QuickActions evaluations={evaluations} />
      <DashboardFooter />
    </div>
  )
}

// --------------------------------------------------------------- indicadores

const kpiTones = {
  blue: { background: 'var(--dt-primary-soft)', color: 'var(--dt-primary)' },
  amber: { background: 'var(--dt-warning-soft)', color: 'var(--dt-warning)' },
  green: { background: 'var(--dt-success-soft)', color: 'var(--dt-success)' },
  violet: { background: '#ede8ff', color: '#6528d7' },
} as const

function Kpi({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  href,
}: {
  icon: typeof ClipboardList
  tone: keyof typeof kpiTones
  label: string
  value: number
  hint: string
  href: string
}) {
  return (
    <article className="dt-card dt-kpi">
      <div className="dt-kpi-top">
        <span className="dt-kpi-icon" style={kpiTones[tone]} aria-hidden="true">
          <Icon />
        </span>
        <div className="dt-kpi-figures">
          <p className="dt-kpi-label">{label}</p>
          <p className="dt-kpi-value">{value}</p>
          <p className="dt-kpi-hint">{hint}</p>
        </div>
      </div>
      <Link href={href} className="dt-section-link">
        Ver todas
        <ArrowRight aria-hidden="true" />
      </Link>
    </article>
  )
}

// ------------------------------------------------------- continuar trabajando

function ResumeCard({ evaluation }: { evaluation: Evaluation }) {
  const progress = evaluationProgress(evaluation)
  const label = name(evaluation)
  const { detail } = stageLines(evaluation)

  return (
    <section className="dt-card dt-card-pad" aria-label="Continuar trabajando">
      <div className="dt-card-head">
        <h2>Continuar trabajando</h2>
        <EvaluationStatusBadge status={evaluation.status} />
      </div>

      <div className="dt-resume">
        <Avatar name={label} size="lg" />
        <div className="min-w-0">
          <p className="dt-resume-name">{label}</p>
          <p className="dt-resume-meta">
            {[meta(evaluation), evaluation.initialData.person.sex].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="dt-resume-progress">
          <span className="dt-resume-percent">{progress.percent}%</span>
          {/* Azul primario: la barra principal marca avance, no identidad. */}
          <EvaluationProgressBar percent={progress.percent} label={`Progreso de ${label}`} />
        </div>
      </div>

      <p className="dt-resume-stage">
        Etapa actual:
        <span className="dt-stage-pill">{currentStageLabel(evaluation)}</span>
        {detail ? (
          <>
            <ChevronRight className="dt-stage-arrow" aria-hidden="true" />
            <span className="dt-stage-detail">{detail}</span>
          </>
        ) : null}
      </p>

      <div className="dt-resume-foot">
        <span className="dt-resume-updated">
          <CalendarDays aria-hidden="true" />
          Última actualización: <strong>{formatUpdatedAt(evaluation.updatedAt)}</strong>
        </span>
        <Link href={`/evaluaciones/${evaluation.id}/${resumeStep(evaluation)}`} className="dt-btn dt-btn-primary">
          Continuar evaluación
          <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- por finalizar

function PendingCard({ evaluations }: { evaluations: Evaluation[] }) {
  const first = evaluations[0]

  return (
    <section className="dt-card dt-card-pad" aria-label="Por finalizar">
      <div className="dt-card-head">
        <h2>Por finalizar</h2>
        {evaluations.length > 0 ? (
          <Link href="/evaluaciones?estado=porfinalizar" className="dt-section-link">
            Ver todas
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      {!first ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nada a medio camino"
          description="Ninguna evaluación está a una sola etapa de quedar lista."
        />
      ) : (
        <>
          <ul className="dt-mini-list">
            {evaluations.slice(0, 3).map((evaluation) => (
              <EvaluationRow key={evaluation.id} evaluation={evaluation} />
            ))}
          </ul>

          {/* El aviso nombra la etapa que falta de verdad, no un texto genérico. */}
          <div className="dt-inline-alert">
            <AlertTriangle aria-hidden="true" />
            <p>
              Esta evaluación está pendiente de completar{' '}
              <strong>{currentStageLabel(first).toLowerCase()}</strong>.
            </p>
            <Link
              href={`/evaluaciones/${first.id}/${resumeStep(first)}`}
              className="dt-btn dt-btn-secondary dt-btn-sm"
            >
              Continuar
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </>
      )}
    </section>
  )
}

// --------------------------------------------------------------------- listas

function ListCard({
  title,
  href,
  evaluations,
  variant = 'active',
  emptyIcon,
  emptyTitle,
  emptyText,
}: {
  title: string
  href: string
  evaluations: Evaluation[]
  variant?: 'active' | 'completed'
  emptyIcon: typeof ClipboardList
  emptyTitle: string
  emptyText: string
}) {
  return (
    <section className="dt-card dt-card-pad" aria-label={title}>
      <div className="dt-card-head">
        <h2>{title}</h2>
        {evaluations.length > 0 ? (
          <Link href={href} className="dt-section-link">
            Ver todas
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      {evaluations.length === 0 ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyText} />
      ) : (
        <ul className="dt-mini-list">
          {evaluations.slice(0, 4).map((evaluation) => (
            <EvaluationRow key={evaluation.id} evaluation={evaluation} variant={variant} />
          ))}
        </ul>
      )}
    </section>
  )
}

function EvaluationRow({
  evaluation,
  variant = 'active',
}: {
  evaluation: Evaluation
  variant?: 'active' | 'completed'
}) {
  const label = name(evaluation)
  const color = identityColor(label)
  const progress = evaluationProgress(evaluation)
  const stage = stageLines(evaluation)
  const done = variant === 'completed'

  return (
    <li>
      <Link href={`/evaluaciones/${evaluation.id}/${resumeStep(evaluation)}`} className="dt-row">
        <Avatar name={label} size="md" />

        <span className="dt-row-person">
          <strong>{label}</strong>
          <small>{meta(evaluation)}</small>
        </span>

        <span className="dt-row-stage">
          {done ? (
            <>
              <strong style={{ color: 'var(--dt-success)' }}>Finalizada</strong>
              <small>{formatUpdatedAt(evaluation.updatedAt)}</small>
            </>
          ) : (
            <>
              <strong>{stage.title}</strong>
              <small>{stage.detail}</small>
            </>
          )}
        </span>

        <span className="dt-row-progress">
          {done ? (
            <CheckCircle2 className="dt-row-check" aria-hidden="true" />
          ) : (
            <>
              <span className="dt-row-percent">{progress.percent}%</span>
              <EvaluationProgressBar percent={progress.percent} color={color.solid} label={`Progreso de ${label}`} />
            </>
          )}
        </span>

        <ChevronRight className="dt-row-chevron" aria-hidden="true" />
      </Link>
    </li>
  )
}

// ------------------------------------------------------------ acciones rápidas

/**
 * Cuatro atajos, cada uno con destino real. «Continuar evaluación» y «Generar
 * informe» apuntan a la evaluación concreta que corresponde cuando existe, y
 * al listado filtrado cuando no: nunca a una pantalla vacía.
 */
function QuickActions({ evaluations }: { evaluations: Evaluation[] }) {
  const resume = [...evaluations]
    .filter((evaluation) => evaluation.status !== 'COMPLETED')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  const ready = evaluations.find((evaluation) => evaluation.status === 'READY_FOR_REVIEW')

  const actions = [
    {
      icon: Sparkles,
      tone: 'blue' as const,
      title: 'Nueva evaluación',
      description: 'Inicia un proceso nuevo',
      href: '/evaluaciones/nueva',
    },
    {
      icon: ClipboardCheck,
      tone: 'green' as const,
      title: 'Continuar evaluación',
      description: resume ? `Retoma a ${name(resume)}` : 'Retoma un proceso abierto',
      href: resume ? `/evaluaciones/${resume.id}/${resumeStep(resume)}` : '/evaluaciones?estado=proceso',
    },
    {
      icon: FileText,
      tone: 'violet' as const,
      title: 'Generar informe',
      description: ready ? `${name(ready)} está lista` : 'Crea el informe final',
      href: ready ? `/evaluaciones/${ready.id}/informe` : '/evaluaciones?estado=listas',
    },
    {
      icon: History,
      tone: 'amber' as const,
      title: 'Historial de evaluaciones',
      description: 'Consulta procesos anteriores',
      href: '/evaluaciones?estado=finalizadas',
    },
  ]

  return (
    <section className="dt-card dt-card-pad" aria-label="Acciones rápidas">
      <div className="dt-card-head">
        <h2>Acciones rápidas</h2>
      </div>
      <div className="dt-actions-grid">
        {actions.map((action) => (
          <Link key={action.title} href={action.href} className="dt-action">
            <span className="dt-action-icon" style={kpiTones[action.tone]} aria-hidden="true">
              <action.icon />
            </span>
            <span className="min-w-0">
              <strong>{action.title}</strong>
              <small>{action.description}</small>
            </span>
            <ChevronRight className="dt-row-chevron" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  )
}

function DashboardFooter() {
  return (
    <p className="dt-home-footer">
      © {new Date().getFullYear()} Detection-test · Todos los derechos reservados.
    </p>
  )
}
