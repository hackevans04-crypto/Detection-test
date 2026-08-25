'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowRight, Check, CheckCircle2, Info, Play } from 'lucide-react'
import { EvaluationProgressBar } from '@/features/evaluations/components/evaluation-bits'
import { StepCard } from '@/features/evaluations/workspace/evaluation-workspace'
import { StepFooter } from '@/features/evaluations/workspace/step-footer'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { instruments } from '@/instruments/catalog'
import type { Instrument } from '@/instruments/types'
import { ageAt, formatAge } from '@/lib/evaluations/format'
import { createInstrumentApplication, type Evaluation } from '@/lib/evaluations/model'
import { instrumentProgress } from '@/lib/evaluations/progress'

export type AgeCheck = {
  applicable: boolean
  ageLabel: string
  rangeLabel: string
  message: string
}

/**
 * Validación de aplicabilidad por edad.
 *
 * Un máximo entero describe un año cumplido: PRO-CÁLCULO dice «6 años» y cubre
 * hasta los 6 años y 11 meses. Un máximo fraccionario es literal: el Test ABC
 * dice «hasta 6½» y ahí se acaba. Si el evaluado queda fuera, el sistema lo
 * advierte y exige una decisión profesional explícita antes de aplicar.
 */
export function ageCheckFor(evaluation: Evaluation, instrument: Instrument): AgeCheck | null {
  const age = ageAt(evaluation.initialData.person.birthDate, evaluation.initialData.evaluationDate)
  if (!age) return null

  const upperBound = Number.isInteger(instrument.edadMax) ? instrument.edadMax + 0.99 : instrument.edadMax
  const applicable = age.decimal >= instrument.edadMin && age.decimal <= upperBound

  return {
    applicable,
    ageLabel: formatAge(age),
    rangeLabel: instrument.rangoTexto,
    message: applicable
      ? `Edad cronológica ${formatAge(age)} · dentro del rango del instrumento (${instrument.rangoTexto}).`
      : `Edad cronológica ${formatAge(age)}. El instrumento está previsto para ${instrument.rangoTexto}: el caso queda fuera de la competencia etaria y los resultados deben interpretarse con precaución.`,
  }
}

export function InstrumentsStep() {
  const { evaluation, update } = useEvaluation()

  const toggle = (instrumentId: string, selected: boolean) =>
    update((current) => {
      const applications = { ...current.instrumentApplications }
      if (selected) {
        applications[instrumentId] = applications[instrumentId] ?? createInstrumentApplication(instrumentId)
      } else {
        delete applications[instrumentId]
      }
      return { ...current, instrumentApplications: applications }
    })

  const selectedCount = Object.keys(evaluation.instrumentApplications).length

  return (
    <StepCard
      step="instrumentos"
      description="Selecciona los instrumentos que vas a aplicar y regístralos uno a uno. Cada instrumento guarda su progreso por separado."
      aside={
        <span className="dt-badge" data-tone={selectedCount > 0 ? 'primary' : 'neutral'}>
          {selectedCount} de {instruments.length} seleccionados
        </span>
      }
    >
      <p className="dt-note">
        <Info aria-hidden="true" />
        Los instrumentos son una fuente de evidencia dentro del expediente, no el expediente entero. Aplícalos en el
        orden que el caso requiera.
      </p>

      <div className="mt-5 grid gap-4">
        {instruments.map((instrument) => (
          <InstrumentCard
            key={instrument.id}
            instrument={instrument}
            onToggle={(selected) => toggle(instrument.id, selected)}
          />
        ))}
      </div>

      <StepFooter
        step="instrumentos"
        disableNext={selectedCount === 0}
        onBeforeNext={() => {
          if (selectedCount > 0) return true
          window.alert('Selecciona al menos un instrumento antes de continuar a resultados.')
          return false
        }}
      />
    </StepCard>
  )
}

export function InstrumentCard({
  instrument,
  onToggle,
}: {
  instrument: Instrument
  onToggle: (selected: boolean) => void
}) {
  const { evaluation } = useEvaluation()
  const application = evaluation.instrumentApplications[instrument.id]
  const selected = Boolean(application)
  const progress = application ? instrumentProgress(application) : null
  const ageCheck = ageCheckFor(evaluation, instrument)
  const href = `/evaluaciones/${evaluation.id}/instrumentos/${instrument.id}`
  const started = (progress?.recorded ?? 0) > 0

  return (
    <article className="dt-instrument-card" data-selected={selected}>
      <div className="dt-instrument-main">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="dt-instrument-badge" aria-hidden="true">
              {instrument.nombre.slice(0, 2)}
            </span>
            <div>
              <h3>{instrument.nombre}</h3>
              <p>{instrument.subtitulo}</p>
            </div>
          </div>
          {application?.status === 'COMPLETED' ? (
            <span className="dt-badge" data-tone="success">
              <Check aria-hidden="true" />
              Completado
            </span>
          ) : started ? (
            <span className="dt-badge" data-tone="primary">
              En proceso
            </span>
          ) : null}
        </header>

        <dl className="dt-instrument-meta">
          <div>
            <dt>Autor</dt>
            <dd>{instrument.autor}</dd>
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
            <dt>Tiempo aproximado</dt>
            <dd>{instrument.tiempo}</dd>
          </div>
          <div>
            <dt>{instrument.unidad.plural}</dt>
            <dd>{instrument.subtests.length}</dd>
          </div>
          <div>
            <dt>Áreas exploradas</dt>
            <dd>{instrument.areas.length}</dd>
          </div>
        </dl>

        {ageCheck ? (
          <p className="dt-note mt-4" data-tone={ageCheck.applicable ? undefined : 'warning'}>
            {ageCheck.applicable ? (
              <CheckCircle2 aria-hidden="true" style={{ color: 'var(--dt-success)' }} />
            ) : (
              <AlertTriangle aria-hidden="true" />
            )}
            {ageCheck.message}
          </p>
        ) : null}
      </div>

      <div className="dt-instrument-action">
        <label className="dt-choice" data-checked={selected} style={{ padding: 12 }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onToggle(event.target.checked)}
            disabled={started}
          />
          <span className="dt-choice-box" aria-hidden="true">
            <Check />
          </span>
          <span className="dt-choice-body">
            <strong>{selected ? 'Seleccionado' : 'Seleccionar'}</strong>
            <p>{started ? 'Ya tiene registros: no se puede quitar.' : 'Se aplicará en esta evaluación.'}</p>
          </span>
        </label>

        {progress && started ? (
          <div className="w-full">
            <p className="mb-1.5 text-xs font-semibold" style={{ color: 'var(--dt-text-soft)' }}>
              {instrument.unidad.singular} {Math.min(progress.recorded + 1, progress.total)} de {progress.total}
            </p>
            <EvaluationProgressBar
              percent={progress.percent}
              tone={progress.percent === 100 ? 'success' : undefined}
              label={`Progreso de ${instrument.nombre}`}
            />
            <p className="mt-1.5 text-right text-xs font-semibold" style={{ color: 'var(--dt-text-soft)' }}>
              {progress.percent}%
            </p>
          </div>
        ) : null}

        {selected ? (
          <Link href={href} className="dt-btn dt-btn-primary dt-btn-block">
            {started ? 'Continuar aplicación' : 'Iniciar aplicación'}
            {started ? <ArrowRight aria-hidden="true" /> : <Play aria-hidden="true" />}
          </Link>
        ) : null}
      </div>
    </article>
  )
}
