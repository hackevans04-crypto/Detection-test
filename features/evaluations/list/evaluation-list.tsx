'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileCheck2,
  FileText,
  ListChecks,
  Plus,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { SelectField } from '@/components/ui/fields'
import { DateField } from '@/components/ui/date-field'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/states'
import { Avatar, EvaluationProgressBar, EvaluationStatusBadge } from '@/features/evaluations/components/evaluation-bits'
import { getInstrument, instruments } from '@/instruments/catalog'
import { useSession } from '@/lib/auth/session-context'
import { ageAt, formatAgeShort, formatUpdatedAt, orDash } from '@/lib/evaluations/format'
import { stepIds, stepLabels, type Evaluation } from '@/lib/evaluations/model'
import { currentStageLabel, evaluationProgress, resumeStep } from '@/lib/evaluations/progress'
import { EvaluationStoreError, listEvaluations, subscribe } from '@/lib/evaluations/store'

const PAGE_SIZE = 10

/**
 * Centro de evaluaciones.
 *
 * Los cuatro indicadores de arriba y las pestañas cuentan exactamente el mismo
 * conjunto: quien lee «6 por completar» y pulsa la pestaña encuentra esas seis
 * y no otras. Todo sale de los expedientes reales; aquí no hay cifras de
 * ejemplo.
 */

const filters = [
  { id: 'todas', label: 'Todas' },
  { id: 'proceso', label: 'En proceso' },
  { id: 'porcompletar', label: 'Por completar' },
  { id: 'porfinalizar', label: 'Por finalizar' },
  { id: 'finalizadas', label: 'Finalizadas' },
] as const

type FilterId = (typeof filters)[number]['id']

function isActive(evaluation: Evaluation) {
  return evaluation.status === 'DRAFT' || evaluation.status === 'IN_PROGRESS'
}

/** A una sola etapa de quedar lista: lo que conviene rematar primero. */
function isAlmostDone(evaluation: Evaluation) {
  return isActive(evaluation) && evaluationProgress(evaluation).pendingSteps.length === 1
}

function matchesFilter(evaluation: Evaluation, filter: FilterId) {
  switch (filter) {
    case 'todas':
      return true
    case 'proceso':
      return isActive(evaluation) && !isAlmostDone(evaluation)
    case 'porcompletar':
      return isAlmostDone(evaluation)
    case 'porfinalizar':
      return evaluation.status === 'READY_FOR_REVIEW'
    case 'finalizadas':
      return evaluation.status === 'COMPLETED'
  }
}

/** Instrumentos que esta evaluación tiene seleccionados, por su nombre real. */
function instrumentNames(evaluation: Evaluation) {
  return Object.keys(evaluation.instrumentApplications)
    .map((id) => getInstrument(id)?.nombre)
    .filter((name): name is string => Boolean(name))
}

type Advanced = { stage: string; instrument: string; from: string; to: string }

const emptyAdvanced: Advanced = { stage: '', instrument: '', from: '', to: '' }

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; evaluations: Evaluation[] }

export function EvaluationList() {
  const { user } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [state, setState] = useState<Load>({ kind: 'loading' })
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const [advanced, setAdvanced] = useState<Advanced>(emptyAdvanced)

  const filterParam = searchParams.get('estado')
  const filter: FilterId = filters.some((item) => item.id === filterParam) ? (filterParam as FilterId) : 'todas'

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

  const activeAdvanced = Object.values(advanced).filter(Boolean).length

  // Cambiar de pestaña, de búsqueda o de filtro devuelve a la primera página.
  // Se ajusta en el render para que la tabla nunca llegue a pintarse en una
  // página que ya no existe dentro del nuevo conjunto.
  const filterKey = `${filter}|${query}|${JSON.stringify(advanced)}`
  const [lastFilterKey, setLastFilterKey] = useState(filterKey)
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey)
    setPage(1)
  }

  const evaluations = useMemo(() => (state.kind === 'ready' ? state.evaluations : []), [state])

  const counts = useMemo(
    () =>
      Object.fromEntries(
        filters.map((item) => [item.id, evaluations.filter((evaluation) => matchesFilter(evaluation, item.id)).length]),
      ) as Record<FilterId, number>,
    [evaluations],
  )

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return evaluations.filter((evaluation) => {
      if (!matchesFilter(evaluation, filter)) return false

      if (advanced.stage && stepLabels[resumeStep(evaluation)] !== advanced.stage) return false
      if (advanced.instrument && !instrumentNames(evaluation).includes(advanced.instrument)) return false
      // El rango se mide sobre la última actualización, que es la fecha por la
      // que se busca un expediente cuando se intenta recordar cuándo se tocó.
      const updated = evaluation.updatedAt.slice(0, 10)
      if (advanced.from && updated < advanced.from) return false
      if (advanced.to && updated > advanced.to) return false

      if (!normalized) return true
      const haystack = [
        evaluation.initialData.person.fullName,
        evaluation.initialData.person.identification,
        evaluation.initialData.person.institution,
        evaluation.initialData.person.grade,
        evaluation.code,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalized)
    })
  }, [evaluations, filter, query, advanced])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const setFilter = (next: FilterId) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'todas') params.delete('estado')
    else params.set('estado', next)
    const search = params.toString()
    router.replace(search ? `/evaluaciones?${search}` : '/evaluaciones', { scroll: false })
  }

  return (
    <>
      <PageHeader
        title="Evaluación Psicopedagógica"
        description="Gestiona y da seguimiento a todas las evaluaciones."
        actions={
          <>
            <Link href="/evaluaciones/informes" className="dt-btn dt-btn-secondary">
              <FileCheck2 aria-hidden="true" />
              Informes emitidos
            </Link>
            <Link href="/evaluaciones/nueva" className="dt-btn dt-btn-primary">
              <Plus aria-hidden="true" />
              Nueva evaluación
            </Link>
          </>
        }
      />

      <div className="dt-page">
        {state.kind === 'loading' ? (
          <LoadingSkeleton rows={4} height={64} label="Cargando evaluaciones" />
        ) : state.kind === 'error' ? (
          <div className="dt-card">
            <ErrorState description={state.message} onRetry={load} />
          </div>
        ) : evaluations.length === 0 ? (
          <div className="dt-card">
            <EmptyState
              icon={ClipboardList}
              title="No tienes evaluaciones psicopedagógicas"
              description="Crea la primera para iniciar el proceso: evaluado, motivo, contexto, áreas, instrumentos, resultados e informe."
              action={{ label: 'Nueva evaluación', href: '/evaluaciones/nueva' }}
            />
          </div>
        ) : (
          <>
            <div className="dt-kpi-grid">
              <Kpi
                icon={ClipboardList}
                label="Total evaluaciones"
                value={evaluations.length}
                hint="Todas las evaluaciones"
                tone="primary"
              />
              <Kpi
                icon={Clock3}
                label="En proceso"
                value={counts.proceso}
                hint={sharePhrase(counts.proceso, evaluations.length)}
                tone="cyan"
              />
              <Kpi
                icon={ListChecks}
                label="Por completar"
                value={counts.porcompletar}
                hint={sharePhrase(counts.porcompletar, evaluations.length)}
                tone="warning"
              />
              <Kpi
                icon={CheckCircle2}
                label="Finalizadas"
                value={counts.finalizadas}
                hint={sharePhrase(counts.finalizadas, evaluations.length)}
                tone="success"
              />
            </div>

            <div className="dt-card">
              <div className="dt-list-toolbar">
                <div className="dt-tabs" role="tablist" aria-label="Filtrar por estado">
                  {filters.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      className="dt-tab"
                      aria-selected={filter === item.id}
                      onClick={() => setFilter(item.id)}
                    >
                      {item.label}
                      <span className="dt-tab-count">{counts[item.id]}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <label className="dt-search md:w-72">
                    <Search aria-hidden="true" />
                    <span className="dt-sr-only">Buscar evaluado</span>
                    <input
                      type="search"
                      value={query}
                      placeholder="Buscar evaluado…"
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="dt-btn dt-btn-secondary"
                    aria-expanded={showFilters}
                    onClick={() => setShowFilters((open) => !open)}
                  >
                    <SlidersHorizontal aria-hidden="true" />
                    Filtros
                    {activeAdvanced > 0 ? <span className="dt-tab-count">{activeAdvanced}</span> : null}
                  </button>
                </div>
              </div>

              {showFilters ? (
                <div className="dt-block" style={{ margin: '0 20px 16px' }}>
                  <div className="dt-inline-fields" data-columns="3">
                    <SelectField
                      label="Etapa actual"
                      value={advanced.stage}
                      onChange={(next) => setAdvanced((current) => ({ ...current, stage: next }))}
                      options={stepIds.map((id) => stepLabels[id])}
                      placeholder="Cualquier etapa"
                    />
                    <SelectField
                      label="Instrumento aplicado"
                      value={advanced.instrument}
                      onChange={(next) => setAdvanced((current) => ({ ...current, instrument: next }))}
                      options={instruments.map((instrument) => instrument.nombre)}
                      placeholder="Cualquier instrumento"
                    />
                    <div />
                    <DateField
                      label="Actualizada desde"
                      value={advanced.from}
                      onChange={(next) => setAdvanced((current) => ({ ...current, from: next }))}
                    />
                    <DateField
                      label="Actualizada hasta"
                      value={advanced.to}
                      onChange={(next) => setAdvanced((current) => ({ ...current, to: next }))}
                    />
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="dt-btn dt-btn-ghost"
                        onClick={() => setAdvanced(emptyAdvanced)}
                        disabled={activeAdvanced === 0}
                      >
                        <X aria-hidden="true" />
                        Limpiar filtros
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {filtered.length === 0 ? (
                <EmptyState
                  icon={SearchX}
                  title="Ninguna evaluación coincide"
                  description={
                    query || activeAdvanced > 0
                      ? 'No encontramos resultados con los filtros aplicados. Prueba con otro nombre o límpialos.'
                      : 'No hay evaluaciones en este estado por ahora.'
                  }
                />
              ) : (
                <>
                  <div className="dt-table-wrap dt-scroll">
                    <table className="dt-table">
                      <caption className="dt-sr-only">Evaluaciones psicopedagógicas</caption>
                      <thead>
                        <tr>
                          <th scope="col">Evaluado</th>
                          <th scope="col">Edad / Curso</th>
                          <th scope="col">Etapa actual</th>
                          <th scope="col">Instrumento</th>
                          <th scope="col">Progreso</th>
                          <th scope="col">Actualización</th>
                          <th scope="col">Estado</th>
                          <th scope="col">
                            <span className="dt-sr-only">Acciones</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((evaluation) => {
                          const name = orDash(evaluation.initialData.person.fullName, 'Evaluación sin nombre')
                          const progress = evaluationProgress(evaluation)
                          const done = evaluation.status === 'COMPLETED'
                          const names = instrumentNames(evaluation)
                          return (
                            <tr key={evaluation.id}>
                              <td>
                                <span className="dt-table-person">
                                  <Avatar name={name} size="sm" />
                                  <span className="min-w-0">
                                    <strong>{name}</strong>
                                    <small>{evaluation.code}</small>
                                  </span>
                                </span>
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                {formatAgeShort(
                                  ageAt(evaluation.initialData.person.birthDate, evaluation.initialData.evaluationDate),
                                )}
                                <br />
                                <span style={{ color: 'var(--dt-faint)' }}>
                                  {orDash(evaluation.initialData.person.grade, 'Curso no registrado')}
                                </span>
                              </td>
                              <td>
                                {currentStageLabel(evaluation)}
                                <br />
                                <span style={{ color: 'var(--dt-faint)' }}>
                                  {progress.completedSteps} de {progress.totalSteps} etapas
                                </span>
                              </td>
                              <td>
                                {names.length === 0 ? (
                                  <span style={{ color: 'var(--dt-faint)' }}>—</span>
                                ) : (
                                  names.map((instrumentName) => (
                                    <span key={instrumentName} className="dt-badge" data-tone="neutral">
                                      {instrumentName}
                                    </span>
                                  ))
                                )}
                              </td>
                              <td style={{ minWidth: 128 }}>
                                <span className="mb-1.5 block text-xs font-semibold">{progress.percent}%</span>
                                <EvaluationProgressBar
                                  percent={progress.percent}
                                  tone={done ? 'success' : undefined}
                                  label={`Progreso de ${name}`}
                                />
                              </td>
                              <td style={{ whiteSpace: 'nowrap' }}>{formatUpdatedAt(evaluation.updatedAt)}</td>
                              <td>
                                <EvaluationStatusBadge status={evaluation.status} />
                              </td>
                              <td>
                                <span className="flex items-center justify-end gap-2">
                                  <Link
                                    href={`/evaluaciones/${evaluation.id}/datos-iniciales`}
                                    className="dt-btn dt-btn-ghost dt-btn-sm"
                                  >
                                    Ver
                                  </Link>
                                  {done ? (
                                    <Link
                                      href={`/evaluaciones/${evaluation.id}/informe`}
                                      className="dt-btn dt-btn-secondary dt-btn-sm"
                                    >
                                      <FileText aria-hidden="true" />
                                      Informe
                                    </Link>
                                  ) : (
                                    <Link
                                      href={`/evaluaciones/${evaluation.id}/${resumeStep(evaluation)}`}
                                      className="dt-btn dt-btn-primary dt-btn-sm"
                                    >
                                      Continuar
                                      <ArrowRight aria-hidden="true" />
                                    </Link>
                                  )}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="dt-pagination">
                    <p>
                      Mostrando {(safePage - 1) * PAGE_SIZE + 1} a {Math.min(safePage * PAGE_SIZE, filtered.length)} de{' '}
                      {filtered.length} {filtered.length === 1 ? 'evaluación' : 'evaluaciones'}
                    </p>
                    {totalPages > 1 ? (
                      <div className="dt-pagination-controls">
                        <button
                          type="button"
                          className="dt-icon-button"
                          onClick={() => setPage((current) => Math.max(1, current - 1))}
                          disabled={safePage === 1}
                          aria-label="Página anterior"
                        >
                          <ChevronLeft aria-hidden="true" />
                        </button>
                        {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
                          <button
                            key={number}
                            type="button"
                            className="dt-page-number"
                            data-active={number === safePage}
                            onClick={() => setPage(number)}
                            aria-label={`Página ${number}`}
                            aria-current={number === safePage ? 'page' : undefined}
                          >
                            {number}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="dt-icon-button"
                          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                          disabled={safePage === totalPages}
                          aria-label="Página siguiente"
                        >
                          <ChevronRight aria-hidden="true" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}

/** «33% del total», y nada cuando no hay nada de lo que sacar porcentaje. */
function sharePhrase(value: number, total: number) {
  if (total === 0) return 'Sin evaluaciones'
  if (value === 0) return 'Ninguna por ahora'
  return `${Math.round((value / total) * 100)}% del total`
}

const kpiTone = {
  primary: { background: 'var(--dt-primary-soft)', color: 'var(--dt-primary)' },
  cyan: { background: '#e2f7ff', color: '#0b93bf' },
  warning: { background: 'var(--dt-warning-soft)', color: 'var(--dt-warning)' },
  success: { background: 'var(--dt-success-soft)', color: 'var(--dt-success)' },
} as const

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof ClipboardList
  label: string
  value: number
  hint: string
  tone: keyof typeof kpiTone
}) {
  return (
    <article className="dt-card dt-kpi">
      <div className="dt-kpi-top">
        <span className="dt-kpi-icon" style={kpiTone[tone]} aria-hidden="true">
          <Icon />
        </span>
        <div className="dt-kpi-figures">
          <p className="dt-kpi-label">{label}</p>
          <p className="dt-kpi-value" style={{ color: 'var(--dt-text)' }}>
            {value}
          </p>
        </div>
      </div>
      <p className="dt-kpi-hint">{hint}</p>
    </article>
  )
}
