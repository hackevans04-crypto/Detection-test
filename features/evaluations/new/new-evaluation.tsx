'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowLeft, ArrowRight, Check, ChevronRight, Loader2, Plus, Search, UserPlus, UserRound } from 'lucide-react'
import { PageHeader } from '@/components/app-shell/page-header'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/states'
import { Avatar } from '@/features/evaluations/components/evaluation-bits'
import { CreationFlowStepper } from '@/features/evaluations/workspace/flow-stepper'
import {
  hasBlockingIssues,
  InitialDataForm,
  validateInitialData,
  type InitialDataIssues,
} from '@/features/evaluations/steps/initial-data-form'
import { useSession } from '@/lib/auth/session-context'
import { formatUpdatedAt, orDash } from '@/lib/evaluations/format'
import { knownPeople, matchesPerson, type KnownPerson } from '@/lib/evaluations/people'
import { emptyInitialData, type Evaluation, type InitialData } from '@/lib/evaluations/model'
import { createEvaluation, EvaluationStoreError, listEvaluations } from '@/lib/evaluations/store'

/**
 * Creación de una evaluación.
 *
 * Dos etapas antes de que el expediente exista: a quién se evalúa y con qué
 * datos. Empezar por la persona, y no por el instrumento, es lo que convierte
 * esto en un expediente psicopedagógico en vez de en una aplicación de tests.
 */

type Phase = 'seleccion' | 'datos'
type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; evaluations: Evaluation[] }

export function NewEvaluation() {
  const router = useRouter()
  const { user, institution } = useSession()

  const [phase, setPhase] = useState<Phase>('seleccion')
  const [state, setState] = useState<Load>({ kind: 'loading' })
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [value, setValue] = useState<InitialData>(emptyInitialData)
  const [errors, setErrors] = useState<InitialDataIssues>({})
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const load = useCallback(() => {
    listEvaluations(user.id)
      .then((evaluations) => setState({ kind: 'ready', evaluations }))
      .catch((error: unknown) =>
        setState({
          kind: 'error',
          message:
            error instanceof EvaluationStoreError
              ? error.message
              : 'No pudimos leer las personas ya registradas en este dispositivo.',
        }),
      )
  }, [user.id])

  useEffect(load, [load])

  const people = useMemo(
    () => (state.kind === 'ready' ? knownPeople(state.evaluations) : []),
    [state],
  )
  const visible = useMemo(() => people.filter((entry) => matchesPerson(entry, query)), [people, query])

  /** Reabrir a alguien conocido copia su ficha: se revisa, no se reescribe. */
  const choose = (entry: KnownPerson) => {
    setSelectedKey(entry.key)
    setValue({ ...emptyInitialData(), person: { ...entry.person } })
    setErrors({})
  }

  const startNew = () => {
    setSelectedKey(null)
    setValue(emptyInitialData())
    setErrors({})
    setPhase('datos')
  }

  const submit = async () => {
    const found = validateInitialData(value)
    setErrors(found)
    if (hasBlockingIssues(found)) {
      document.querySelector<HTMLElement>('.dt-field-error')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }

    setSubmitting(true)
    setFailure(null)
    try {
      const evaluation = await createEvaluation({
        evaluatorId: user.id,
        evaluatorName: user.name,
        institutionId: institution.id,
        initialData: value,
      })
      router.push(`/evaluaciones/${evaluation.id}/motivo`)
    } catch (error) {
      setSubmitting(false)
      setFailure(
        error instanceof EvaluationStoreError ? error.message : 'No pudimos crear la evaluación. Vuelve a intentarlo.',
      )
    }
  }

  return (
    <>
      <PageHeader
        above={
          <nav className="dt-breadcrumb mb-2" aria-label="Ruta de navegación">
            <Link href="/evaluaciones">
              <ArrowLeft className="inline size-3.5 align-[-2px]" aria-hidden="true" /> Evaluaciones
            </Link>
            <ChevronRight aria-hidden="true" />
            <span aria-current="page">Nueva evaluación</span>
          </nav>
        }
        title="Nueva evaluación"
        description={phase === 'seleccion' ? 'Elige a quién se va a evaluar.' : 'Registra los datos del evaluado.'}
      />

      <div className="dt-page">
        <section className="dt-card dt-flowbar" aria-label="Proceso de evaluación">
          <CreationFlowStepper activeIndex={phase === 'seleccion' ? 0 : 1} />
        </section>

        {phase === 'seleccion' ? (
          <section className="dt-card dt-card-pad" aria-labelledby="seleccion-titulo">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="seleccion-titulo" className="text-lg font-bold tracking-tight" style={{ color: 'var(--dt-text)' }}>
                  Selecciona un evaluado
                </h2>
                <p className="mt-1 max-w-2xl text-sm" style={{ color: 'var(--dt-muted)' }}>
                  Busca a un estudiante ya registrado o crea uno nuevo. Las personas que ves aquí provienen de las
                  evaluaciones que has hecho.
                </p>
              </div>
              <button type="button" className="dt-btn dt-btn-primary" onClick={startNew}>
                <Plus aria-hidden="true" />
                Nuevo evaluado
              </button>
            </div>

            <div className="mt-5">
              <label className="dt-search">
                <Search aria-hidden="true" />
                <span className="dt-sr-only">Buscar evaluado</span>
                <input
                  type="search"
                  value={query}
                  placeholder="Buscar por nombre, cédula o código…"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>

            <div className="mt-4">
              {state.kind === 'loading' ? (
                <LoadingSkeleton rows={3} height={62} label="Cargando personas registradas" />
              ) : state.kind === 'error' ? (
                <ErrorState description={state.message} onRetry={load} />
              ) : people.length === 0 ? (
                <EmptyState
                  icon={UserPlus}
                  title="Todavía no hay personas registradas"
                  description="Esta es tu primera evaluación. Crea al evaluado para abrir el expediente."
                  action={
                    <button type="button" className="dt-btn dt-btn-primary" onClick={startNew}>
                      <Plus aria-hidden="true" />
                      Nuevo evaluado
                    </button>
                  }
                />
              ) : visible.length === 0 ? (
                <EmptyState
                  icon={UserRound}
                  title="Nadie coincide con la búsqueda"
                  description={`No encontramos a nadie que coincida con «${query}». Puedes registrarlo como evaluado nuevo.`}
                  action={
                    <button type="button" className="dt-btn dt-btn-primary" onClick={startNew}>
                      <Plus aria-hidden="true" />
                      Nuevo evaluado
                    </button>
                  }
                />
              ) : (
                <ul className="dt-person-list">
                  {visible.map((entry) => (
                    <li key={entry.key}>
                      <button
                        type="button"
                        className="dt-person-row"
                        data-selected={selectedKey === entry.key}
                        aria-pressed={selectedKey === entry.key}
                        onClick={() => choose(entry)}
                      >
                        <Avatar name={entry.person.fullName} size="sm" />
                        <span className="dt-person-row-body">
                          <strong>{entry.person.fullName}</strong>
                          <small>
                            {[
                              entry.ageLabel,
                              orDash(entry.person.grade, 'Curso no registrado'),
                              entry.person.identification ? `C.I. ${entry.person.identification}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </small>
                        </span>
                        <span className="dt-person-row-meta">
                          Última evaluación: {formatUpdatedAt(entry.lastEvaluationAt)}
                          <br />
                          {entry.evaluationCount} {entry.evaluationCount === 1 ? 'expediente' : 'expedientes'}
                        </span>
                        <span className="dt-person-row-check" aria-hidden="true">
                          <Check />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="dt-step-footer">
              <Link href="/evaluaciones" className="dt-btn dt-btn-secondary">
                <ArrowLeft aria-hidden="true" />
                Cancelar
              </Link>
              <div className="dt-step-footer-actions">
                <button
                  type="button"
                  className="dt-btn dt-btn-primary"
                  disabled={selectedKey === null}
                  onClick={() => setPhase('datos')}
                >
                  Siguiente
                  <ArrowRight aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="dt-card dt-card-pad" aria-labelledby="datos-titulo">
            <h2 id="datos-titulo" className="text-lg font-bold tracking-tight" style={{ color: 'var(--dt-text)' }}>
              Datos personales
            </h2>
            <p className="mt-1 max-w-2xl text-sm" style={{ color: 'var(--dt-muted)' }}>
              {selectedKey
                ? 'Revisa la ficha del evaluado antes de abrir el expediente. Los cambios sólo afectan a esta evaluación.'
                : 'Completa la ficha del evaluado. Los campos marcados con * son obligatorios.'}
            </p>

            <div className="mt-6">
              <InitialDataForm value={value} onChange={setValue} errors={errors} />
            </div>

            {failure ? (
              <p className="dt-note mt-6" data-tone="danger" role="alert">
                <AlertCircle aria-hidden="true" />
                {failure}
              </p>
            ) : null}

            <div className="dt-step-footer">
              <button type="button" className="dt-btn dt-btn-secondary" onClick={() => setPhase('seleccion')}>
                <ArrowLeft aria-hidden="true" />
                Anterior
              </button>
              <div className="dt-step-footer-actions">
                <button
                  type="button"
                  className="dt-btn dt-btn-primary"
                  onClick={() => void submit()}
                  disabled={submitting}
                >
                  {submitting ? <Loader2 className="dt-spin" aria-hidden="true" /> : null}
                  Crear evaluación y continuar
                  {submitting ? null : <ArrowRight aria-hidden="true" />}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  )
}
