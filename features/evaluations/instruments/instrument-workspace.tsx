'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Info,
  LogOut,
  PencilLine,
  Play,
} from 'lucide-react'
import { TextareaField } from '@/components/ui/fields'
import { EmptyState } from '@/components/ui/states'
import { AutosaveIndicator } from '@/features/evaluations/workspace/step-footer'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { ageCheckFor, type AgeCheck } from '@/features/evaluations/steps/instruments-step'
import { getInstrument } from '@/instruments/catalog'
import type { Instrument, Subtest } from '@/instruments/types'
import { createInstrumentApplication, emptySubtestEntry, type InstrumentApplication } from '@/lib/evaluations/model'
import { instrumentProgress, isSubtestRecorded } from '@/lib/evaluations/progress'
import { instrumentResult, type InstrumentResult } from '@/lib/evaluations/results'

/**
 * Aplicación de un instrumento, dentro del workspace de su evaluación.
 *
 * Un instrumento no es un formulario: es un procedimiento con fases. Antes de
 * aplicar hay que saber si procede hacerlo; después hay que leer el protocolo
 * contra el baremo y, sólo al final, interpretarlo. Esas cuatro fases son la
 * navegación de esta pantalla.
 *
 * Nunca es una pantalla suelta: conserva el sidebar del proceso, la cabecera
 * del evaluado y una migaja que devuelve a instrumentos. El error que corrige
 * es justo el contrario: entrar a un test y perder de vista a quién se está
 * evaluando.
 */

const phaseIds = ['preparacion', 'aplicacion', 'resultado', 'interpretacion'] as const
type Phase = (typeof phaseIds)[number]

const phaseLabels: Record<Phase, string> = {
  preparacion: 'Preparación',
  aplicacion: 'Aplicación',
  resultado: 'Resultado',
  interpretacion: 'Interpretación',
}

const phaseIcons: Record<Phase, typeof Info> = {
  preparacion: ClipboardList,
  aplicacion: Play,
  resultado: FileText,
  interpretacion: PencilLine,
}

/** Dónde retomar al abrir: nadie quiere volver a la ficha técnica de un test ya aplicado. */
function initialPhase(application: InstrumentApplication): Phase {
  if (application.status === 'COMPLETED') return 'resultado'
  if (application.status === 'IN_PROGRESS') return 'aplicacion'
  return 'preparacion'
}

export function InstrumentWorkspace({ instrumentId }: { instrumentId: string }) {
  const router = useRouter()
  const { evaluation, update, saveNow, saveState, saveError, lastSavedAt } = useEvaluation()
  const instrument = getInstrument(instrumentId)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  const storedApplication = instrument ? evaluation.instrumentApplications[instrument.id] : undefined
  const [phase, setPhase] = useState<Phase>(() =>
    storedApplication ? initialPhase(storedApplication) : 'preparacion',
  )

  if (!instrument) {
    return (
      <section className="dt-card">
        <EmptyState
          icon={AlertTriangle}
          title="Instrumento no encontrado"
          description="Este instrumento no existe en el catálogo configurado."
          action={{ label: 'Volver a instrumentos', href: `/evaluaciones/${evaluation.id}/instrumentos` }}
        />
      </section>
    )
  }

  const application = storedApplication ?? createInstrumentApplication(instrument.id)
  const index = Math.min(Math.max(application.currentSubtestIndex, 0), instrument.subtests.length - 1)
  const subtest = instrument.subtests[index]
  const entry = application.entries[subtest.id] ?? emptySubtestEntry()
  const progress = instrumentProgress(application)
  const ageCheck = ageCheckFor(evaluation, instrument)
  const result = instrumentResult(evaluation, instrument.id)
  const instrumentsHref = `/evaluaciones/${evaluation.id}/instrumentos`

  // Fuera del rango de edad no se bloquea la aplicación para siempre: se exige
  // que el profesional lo asuma explícitamente. Decidir por él sería peor que
  // avisarle, y dejarle pasar sin más es el error que corrige esta pantalla.
  const ageBlocked = Boolean(ageCheck && !ageCheck.applicable && !application.ageWarningAcknowledged)

  const patchApplication = (patch: Partial<InstrumentApplication>) =>
    update((current) => ({
      ...current,
      instrumentApplications: {
        ...current.instrumentApplications,
        [instrument.id]: { ...(current.instrumentApplications[instrument.id] ?? application), ...patch },
      },
    }))

  const setEntry = (patch: Partial<typeof entry>) =>
    update((current) => {
      const existing = current.instrumentApplications[instrument.id] ?? application
      return {
        ...current,
        instrumentApplications: {
          ...current.instrumentApplications,
          [instrument.id]: {
            ...existing,
            entries: {
              ...existing.entries,
              [subtest.id]: {
                ...(existing.entries[subtest.id] ?? emptySubtestEntry()),
                ...patch,
                updatedAt: new Date().toISOString(),
              },
            },
          },
        },
      }
    })

  const goTo = (nextIndex: number) => patchApplication({ currentSubtestIndex: nextIndex })

  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  const goToPhase = async (next: Phase) => {
    setPhase(next)
    await saveNow()
    toTop()
  }

  const exit = async () => {
    await saveNow()
    router.push(instrumentsHref)
  }

  const finishOrNext = async () => {
    if (index < instrument.subtests.length - 1) {
      goTo(index + 1)
      await saveNow()
      toTop()
      return
    }
    // Al cerrar el último subtest se pasa al protocolo, no a la lista: el
    // resultado es la razón por la que se aplicó el instrumento.
    await goToPhase('resultado')
  }

  return (
    <>
      <section className="dt-card dt-card-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <nav className="dt-breadcrumb" aria-label="Ruta dentro de la evaluación">
              <Link href={instrumentsHref}>Instrumentos</Link>
              <ChevronRight aria-hidden="true" />
              <span aria-current="page">{instrument.nombre}</span>
            </nav>
            <h2 className="mt-3 font-display text-xl font-bold tracking-tight" style={{ color: 'var(--dt-text)' }}>
              {instrument.nombre}
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--dt-muted)' }}>
              {instrument.subtitulo} · {progress.recorded} de {progress.total} {instrument.unidad.plural} registrados
            </p>
          </div>
          <button
            type="button"
            className="dt-btn dt-btn-secondary dt-btn-sm"
            onClick={() => (saveState === 'dirty' || saveState === 'error' ? setShowLeaveConfirm(true) : void exit())}
          >
            <LogOut aria-hidden="true" />
            Salir
          </button>
        </div>

        <div className="dt-tabs mt-5" role="tablist" aria-label={`Fases de ${instrument.nombre}`}>
          {phaseIds.map((id) => {
            const Icon = phaseIcons[id]
            const locked = id === 'aplicacion' && ageBlocked
            return (
              <button
                key={id}
                type="button"
                role="tab"
                className="dt-tab"
                aria-selected={phase === id}
                disabled={locked}
                title={locked ? 'Confirma la aplicación fuera de rango antes de empezar.' : undefined}
                onClick={() => void goToPhase(id)}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {phaseLabels[id]}
              </button>
            )
          })}
        </div>
      </section>

      {phase === 'preparacion' ? (
        <PreparationPhase
          instrument={instrument}
          ageCheck={ageCheck}
          acknowledged={application.ageWarningAcknowledged}
          onAcknowledge={(value) => patchApplication({ ageWarningAcknowledged: value })}
          blocked={ageBlocked}
          started={progress.recorded > 0}
          onStart={() => void goToPhase('aplicacion')}
        />
      ) : null}

      {phase === 'aplicacion' ? (
        <div className="dt-apply">
          <aside className="dt-apply-aside">
            <div className="dt-card" style={{ padding: 10 }}>
              <p
                className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{ color: 'var(--dt-faint)' }}
              >
                {instrument.unidad.plural}
              </p>
              <nav className="dt-unit-nav" aria-label={`${instrument.unidad.plural} de ${instrument.nombre}`}>
                {instrument.subtests.map((item, itemIndex) => {
                  const recorded = isSubtestRecorded(application, item.id)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="dt-unit-item"
                      data-recorded={recorded}
                      aria-current={itemIndex === index ? 'true' : undefined}
                      onClick={() => goTo(itemIndex)}
                    >
                      <span className="dt-unit-index" aria-hidden="true">
                        {recorded && itemIndex !== index ? <Check /> : itemIndex + 1}
                      </span>
                      <span className="min-w-0">{item.nombre}</span>
                      <span className="dt-sr-only">{recorded ? '(registrado)' : '(pendiente)'}</span>
                    </button>
                  )
                })}
              </nav>
            </div>
          </aside>

          <section className="dt-card dt-card-pad">
            <p className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--dt-faint)' }}>
              {instrument.unidad.singular} {index + 1} de {instrument.subtests.length}
            </p>
            <h3 className="mt-1 text-base font-bold" style={{ color: 'var(--dt-text)' }}>
              {subtest.nombre}
            </h3>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--dt-muted)' }}>
              {subtest.instrucciones}
            </p>

            <hr className="dt-divider" />

            {instrument.scoringMode === 'manual_score' ? (
              <ManualScoreInput subtest={subtest} value={entry.pd} onChange={(next) => setEntry({ pd: next })} />
            ) : (
              <PdPtInput
                hasNormativeTables={instrument.hasNormativeTables}
                pd={entry.pd}
                pt={entry.pt}
                onChange={(patch) => setEntry(patch)}
              />
            )}

            <div className="mt-6">
              <TextareaField
                label="Observaciones"
                value={entry.observations}
                onChange={(next) => setEntry({ observations: next })}
                placeholder="Ejecución observada, apoyos requeridos, actitud durante la tarea…"
                rows={4}
              />
            </div>

            <div className="dt-step-footer">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="dt-btn dt-btn-secondary"
                  onClick={() => (index === 0 ? void goToPhase('preparacion') : goTo(index - 1))}
                >
                  <ArrowLeft aria-hidden="true" />
                  Anterior
                </button>
                <AutosaveIndicator state={saveState} lastSavedAt={lastSavedAt} error={saveError} />
              </div>
              <div className="dt-step-footer-actions">
                <button type="button" className="dt-btn dt-btn-primary" onClick={() => void finishOrNext()}>
                  {index < instrument.subtests.length - 1 ? 'Guardar y continuar' : 'Guardar y ver resultado'}
                  <ArrowRight aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>

          <aside className="dt-card dt-card-pad">
            <h3 className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
              Información {instrument.scoringMode === 'manual_score' ? 'del subtest' : 'de la subárea'}
            </h3>
            <dl className="dt-meta-list mt-4">
              <div>
                <dt>Área evaluada</dt>
                <dd>{subtest.area}</dd>
              </div>
              <div>
                <dt>Rango de edad</dt>
                <dd>{instrument.rangoTexto}</dd>
              </div>
              <div>
                <dt>Tiempo estimado</dt>
                <dd>{subtest.tiempoEstimado}</dd>
              </div>
              <div>
                <dt>Puntuación máxima</dt>
                <dd>
                  {instrument.scoringMode === 'manual_score'
                    ? `${subtest.puntajeMaximo} puntos`
                    : 'Definida por la tabla del instrumento'}
                </dd>
              </div>
              <div>
                <dt>Criterio de corrección</dt>
                <dd>{subtest.criterioCorreccion}</dd>
              </div>
              <div>
                <dt>Estado normativo</dt>
                <dd>{instrument.normativeStatus}</dd>
              </div>
            </dl>

            <p className="dt-note mt-5">
              <Info aria-hidden="true" />
              {instrument.instrucciones}
            </p>
          </aside>
        </div>
      ) : null}

      {phase === 'resultado' && result ? (
        <ResultPhase
          result={result}
          onBack={() => void goToPhase('aplicacion')}
          onNext={() => void goToPhase('interpretacion')}
        />
      ) : null}

      {phase === 'interpretacion' ? (
        <section className="dt-card dt-card-pad">
          <h3 className="dt-section-title">
            <PencilLine aria-hidden="true" />
            Interpretación de {instrument.nombre}
          </h3>
          <p className="mt-1 max-w-2xl text-sm" style={{ color: 'var(--dt-muted)' }}>
            Lectura profesional de este instrumento en concreto. Es distinta de la interpretación global del expediente,
            que se redacta en la etapa de resultados con todas las fuentes a la vista.
          </p>

          {result?.global ? (
            <p className="dt-note mt-5">
              <Info aria-hidden="true" />
              Resultado calculado: {result.pdTotal} puntos · {result.global.range} · {result.global.level}.
            </p>
          ) : null}

          <div className="mt-5">
            <TextareaField
              label={`Interpretación de ${instrument.nombre}`}
              value={application.interpretation}
              onChange={(next) => patchApplication({ interpretation: next })}
              placeholder="Qué dice este instrumento sobre el desempeño observado, con qué precauciones debe leerse…"
              rows={9}
            />
          </div>

          <div className="dt-step-footer">
            <div className="flex items-center gap-3">
              <button type="button" className="dt-btn dt-btn-secondary" onClick={() => void goToPhase('resultado')}>
                <ArrowLeft aria-hidden="true" />
                Ver resultado
              </button>
              <AutosaveIndicator state={saveState} lastSavedAt={lastSavedAt} error={saveError} />
            </div>
            <div className="dt-step-footer-actions">
              <button type="button" className="dt-btn dt-btn-primary" onClick={() => void exit()}>
                Guardar y volver a instrumentos
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {showLeaveConfirm ? (
        <div className="dt-dialog-backdrop" role="presentation">
          <div className="dt-dialog" role="alertdialog" aria-labelledby="leave-title" aria-describedby="leave-body">
            <h2 id="leave-title">Tienes cambios sin guardar</h2>
            <p id="leave-body">
              Si sales ahora se guardará lo registrado en este {instrument.unidad.singular.toLowerCase()} antes de volver
              a la lista de instrumentos.
            </p>
            <div className="dt-dialog-actions">
              <button type="button" className="dt-btn dt-btn-secondary" onClick={() => setShowLeaveConfirm(false)}>
                Seguir aquí
              </button>
              <button
                type="button"
                className="dt-btn dt-btn-primary"
                onClick={() => {
                  setShowLeaveConfirm(false)
                  void exit()
                }}
              >
                Guardar y salir
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

/**
 * Ficha técnica y validación de aplicabilidad.
 *
 * Es la pantalla que el informe describe antes de cualquier registro: qué mide
 * el instrumento, para qué edad está previsto y si este caso entra en ese
 * rango. Cuando no entra, aplicar sigue siendo posible —a veces es lo
 * indicado— pero exige una confirmación que queda guardada en el expediente.
 */
function PreparationPhase({
  instrument,
  ageCheck,
  acknowledged,
  onAcknowledge,
  blocked,
  started,
  onStart,
}: {
  instrument: Instrument
  ageCheck: AgeCheck | null
  acknowledged: boolean
  onAcknowledge: (value: boolean) => void
  blocked: boolean
  started: boolean
  onStart: () => void
}) {
  return (
    <div className="dt-instrument-layout">
      <section className="dt-card dt-card-pad">
        <h3 className="dt-section-title">
          <ClipboardList aria-hidden="true" />
          Ficha técnica
        </h3>

        <dl className="dt-meta-list mt-4">
          <div>
            <dt>Instrumento</dt>
            <dd>
              {instrument.nombre} · {instrument.subtitulo}
            </dd>
          </div>
          <div>
            <dt>Autor</dt>
            <dd>{instrument.autor}</dd>
          </div>
          <div>
            <dt>Objetivo</dt>
            <dd>{instrument.objetivo}</dd>
          </div>
          <div>
            <dt>Aplicación</dt>
            <dd>{instrument.aplicacion}</dd>
          </div>
          <div>
            <dt>Rango de edad</dt>
            <dd>{instrument.rangoTexto}</dd>
          </div>
          <div>
            <dt>Tiempo documentado</dt>
            <dd>{instrument.tiempo}</dd>
          </div>
          <div>
            <dt>Estructura</dt>
            <dd>
              {instrument.subtests.length} {instrument.unidad.plural}
            </dd>
          </div>
        </dl>

        <hr className="dt-divider" />

        <h4 className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
          Validación de aplicabilidad
        </h4>
        {ageCheck ? (
          <>
            <dl className="dt-meta-list mt-3">
              <div>
                <dt>Edad cronológica</dt>
                <dd>{ageCheck.ageLabel}</dd>
              </div>
              <div>
                <dt>Rango del instrumento</dt>
                <dd>{ageCheck.rangeLabel}</dd>
              </div>
            </dl>
            <p className="dt-note mt-4" data-tone={ageCheck.applicable ? undefined : 'warning'}>
              {ageCheck.applicable ? (
                <CheckCircle2 aria-hidden="true" style={{ color: 'var(--dt-success)' }} />
              ) : (
                <AlertTriangle aria-hidden="true" />
              )}
              {ageCheck.message}
            </p>

            {!ageCheck.applicable ? (
              <label className="dt-choice mt-4" data-checked={acknowledged}>
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => onAcknowledge(event.target.checked)}
                />
                <span className="dt-choice-box" aria-hidden="true">
                  <Check />
                </span>
                <span className="dt-choice-body">
                  <strong>Aplicar fuera del rango bajo criterio profesional</strong>
                  <p>
                    Confirmo que el caso queda fuera de la competencia etaria del instrumento y que los resultados se
                    interpretarán con precaución. Esta decisión queda registrada en el expediente.
                  </p>
                </span>
              </label>
            ) : null}
          </>
        ) : (
          <p className="dt-note mt-3" data-tone="warning">
            <AlertTriangle aria-hidden="true" />
            No se puede validar la edad: faltan la fecha de nacimiento o la fecha de evaluación en los datos iniciales.
          </p>
        )}

        <div className="dt-step-footer">
          <span />
          <div className="dt-step-footer-actions">
            <button type="button" className="dt-btn dt-btn-primary" disabled={blocked} onClick={onStart}>
              {started ? 'Continuar aplicación' : 'Iniciar aplicación'}
              {started ? <ArrowRight aria-hidden="true" /> : <Play aria-hidden="true" />}
            </button>
          </div>
        </div>
      </section>

      <aside className="dt-card dt-card-pad">
        <h3 className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
          Áreas que explora
        </h3>
        <ul className="dt-mini-list mt-3">
          {instrument.areas.map((area) => (
            <li key={area}>{area}</li>
          ))}
        </ul>

        <hr className="dt-divider" />

        <h3 className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
          Antes de empezar
        </h3>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--dt-muted)' }}>
          {instrument.instrucciones}
        </p>

        <p className="dt-note mt-4" data-tone="warning">
          <AlertTriangle aria-hidden="true" />
          {instrument.normativeStatus}
        </p>
      </aside>
    </div>
  )
}

/**
 * Protocolo y baremo.
 *
 * El sistema suma y clasifica; nada más. La fila del baremo que corresponde al
 * total se resalta, pero su texto sale del catálogo: aquí no se redacta ni una
 * conclusión.
 */
function ResultPhase({
  result,
  onBack,
  onNext,
}: {
  result: InstrumentResult
  onBack: () => void
  onNext: () => void
}) {
  const { instrument, rows, global } = result
  const isPdPt = instrument.scoringMode === 'pd_pt'

  return (
    <section className="dt-card dt-card-pad">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="dt-section-title">
            <FileText aria-hidden="true" />
            Protocolo de {instrument.unidad.plural}
          </h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--dt-muted)' }}>
            {result.recorded} de {result.total} {instrument.unidad.plural} registrados.
          </p>
        </div>
        {global ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="dt-badge" data-tone="primary">
              {global.range}
            </span>
            <span className="dt-badge" data-tone="neutral">
              {global.level}
            </span>
          </div>
        ) : null}
      </div>

      <div className="dt-split-even mt-5">
        <div className="dt-table-wrap dt-scroll" style={{ border: '1px solid var(--dt-border)' }}>
          <table className="dt-table" data-compact="true">
            <caption className="dt-sr-only">Protocolo de {instrument.nombre}</caption>
            <thead>
              <tr>
                <th scope="col">{instrument.unidad.singular}</th>
                <th scope="col">{isPdPt ? 'PD' : 'Puntuación'}</th>
                {isPdPt ? <th scope="col">PT</th> : <th scope="col">Máximo</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.subtestId}>
                  <td style={{ color: 'var(--dt-text)', fontWeight: 600 }}>{row.nombre}</td>
                  <td>{row.pd ?? '—'}</td>
                  {isPdPt ? <td>{row.pt ?? '—'}</td> : <td>{row.max}</td>}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ fontWeight: 700, color: 'var(--dt-text)' }}>Total</td>
                <td style={{ fontWeight: 700, color: 'var(--dt-text)' }}>{result.pdTotal}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="dt-table-wrap dt-scroll" style={{ border: '1px solid var(--dt-border)' }}>
          <table className="dt-table" data-compact="true">
            <caption className="dt-sr-only">Baremo de {instrument.nombre}</caption>
            <thead>
              <tr>
                <th scope="col">Baremo</th>
                <th scope="col">Rango</th>
                <th scope="col">Nivel</th>
              </tr>
            </thead>
            <tbody>
              {instrument.baremos.map((baremo) => {
                const active = global?.range === baremo.rango
                return (
                  <tr key={baremo.rango} style={active ? { background: 'var(--dt-primary-soft)' } : undefined}>
                    <td style={{ color: 'var(--dt-text)', fontWeight: active ? 700 : 500 }}>{baremo.descripcion}</td>
                    <td>
                      {active ? (
                        <span className="dt-badge" data-tone="primary">
                          {baremo.rango}
                        </span>
                      ) : (
                        baremo.rango
                      )}
                    </td>
                    <td>{baremo.nivel}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {result.notices.length > 0 ? (
        <ul className="mt-5 grid gap-2">
          {result.notices.map((notice) => (
            <li key={notice} className="dt-note" data-tone={notice.startsWith('Faltan') ? 'warning' : undefined}>
              {notice.startsWith('Faltan') ? <AlertTriangle aria-hidden="true" /> : <Info aria-hidden="true" />}
              {notice}
            </li>
          ))}
        </ul>
      ) : null}

      {rows.some((row) => row.observations.trim()) ? (
        <>
          <hr className="dt-divider" />
          <h4 className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
            Observaciones registradas
          </h4>
          <dl className="dt-meta-list mt-3">
            {rows
              .filter((row) => row.observations.trim())
              .map((row) => (
                <div key={row.subtestId}>
                  <dt>{row.nombre}</dt>
                  <dd>{row.observations}</dd>
                </div>
              ))}
          </dl>
        </>
      ) : null}

      <div className="dt-step-footer">
        <button type="button" className="dt-btn dt-btn-secondary" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Volver a la aplicación
        </button>
        <div className="dt-step-footer-actions">
          <button type="button" className="dt-btn dt-btn-primary" onClick={onNext}>
            Interpretar resultado
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}

/** Escala discreta observada, con las etiquetas que declara el catálogo. */
function ManualScoreInput({
  subtest,
  value,
  onChange,
}: {
  subtest: Subtest
  value: string
  onChange: (value: string) => void
}) {
  const options = subtest.escala ?? []
  const groupLabel = `Puntuación de ${subtest.nombre}`

  return (
    <fieldset className="dt-fieldset">
      <legend className="dt-label" style={{ marginBottom: 10 }}>
        Puntuación <em aria-hidden="true">*</em>
      </legend>
      <div className="dt-scale" role="radiogroup" aria-label={groupLabel}>
        {options.map((option, optionIndex) => {
          const score = String(optionIndex)
          return (
            <label key={option} className="dt-scale-option" data-checked={value === score} title={option}>
              <input
                type="radio"
                name={`score-${subtest.id}`}
                value={score}
                checked={value === score}
                onChange={() => onChange(score)}
              />
              {optionIndex}
              <span className="dt-sr-only">{option}</span>
            </label>
          )
        })}
      </div>
      <ul className="dt-scale-legend">
        {options.map((option) => (
          <li key={option}>{option}</li>
        ))}
      </ul>
      {value ? (
        <button type="button" className="dt-btn dt-btn-ghost dt-btn-sm mt-3" onClick={() => onChange('')}>
          Borrar puntuación
        </button>
      ) : null}
    </fieldset>
  )
}

/**
 * PD y PT. La PT no se calcula: mientras el catálogo declare que no hay tablas
 * normativas cargadas, se dice y se deja el campo al criterio del profesional.
 */
function PdPtInput({
  hasNormativeTables,
  pd,
  pt,
  onChange,
}: {
  hasNormativeTables: boolean
  pd: string
  pt: string
  onChange: (patch: { pd?: string; pt?: string }) => void
}) {
  return (
    <fieldset className="dt-fieldset">
      <legend className="dt-label" style={{ marginBottom: 10 }}>
        Puntuaciones
      </legend>
      <div className="dt-form-grid">
        <label className="dt-field">
          <span className="dt-label">
            PD · Puntuación directa <em aria-hidden="true">*</em>
          </span>
          <input
            className="dt-input"
            type="number"
            inputMode="numeric"
            min={0}
            value={pd}
            placeholder="0"
            onChange={(event) => onChange({ pd: event.target.value })}
          />
        </label>

        <label className="dt-field">
          <span className="dt-label">PT · Puntuación típica</span>
          <input
            className="dt-input"
            type="number"
            inputMode="numeric"
            min={0}
            value={pt}
            placeholder={hasNormativeTables ? 'Se calcula desde la tabla' : 'Ingrésala si dispones de la tabla'}
            readOnly={hasNormativeTables}
            onChange={(event) => onChange({ pt: event.target.value })}
          />
          <span className="dt-field-hint">
            {hasNormativeTables
              ? 'Convertida desde la tabla normativa del instrumento.'
              : 'Conversión normativa no disponible. La PT se ingresa manualmente sólo si cuentas con la tabla correspondiente.'}
          </span>
        </label>
      </div>
    </fieldset>
  )
}
