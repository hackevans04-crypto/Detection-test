'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AlertTriangle, ArrowRight, Calculator, Info, PencilLine } from 'lucide-react'
import { TextareaField } from '@/components/ui/fields'
import { EmptyState } from '@/components/ui/states'
import { StepCard } from '@/features/evaluations/workspace/evaluation-workspace'
import { StepFooter } from '@/features/evaluations/workspace/step-footer'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { evaluationResults, instrumentProfile, type InstrumentResult, type ProfileBand } from '@/lib/evaluations/results'
import { orDash } from '@/lib/evaluations/format'

const bandColor: Record<ProfileBand, string> = {
  low: 'var(--dt-danger)',
  mid: 'var(--dt-warning)',
  high: 'var(--dt-success)',
}

/**
 * Resultados e interpretación.
 *
 * Un instrumento por pestaña, y dentro de cada uno la misma lectura de tres
 * partes: el resultado que sale del baremo, el protocolo que lo sostiene y la
 * tabla de referencia. Abajo, separada por una línea, la interpretación que
 * escribe el profesional. El sistema calcula; nadie más que una persona
 * interpreta.
 */
export function ResultsStep() {
  const { evaluation, update } = useEvaluation()
  const results = evaluationResults(evaluation)
  const [activeId, setActiveId] = useState<string | null>(null)

  if (results.length === 0) {
    return (
      <StepCard step="resultados">
        <EmptyState
          icon={Calculator}
          title="Todavía no hay instrumentos aplicados"
          description="Los resultados se construyen con lo que registres en la etapa de instrumentos."
          action={{ label: 'Ir a instrumentos', href: `/evaluaciones/${evaluation.id}/instrumentos` }}
        />
      </StepCard>
    )
  }

  const active = results.find((result) => result.instrument.id === activeId) ?? results[0]

  return (
    <StepCard
      step="resultados"
      description="Los datos calculados provienen de lo registrado y de los baremos del instrumento. La interpretación la escribes tú."
      aside={
        <span className="dt-badge" data-tone="neutral">
          {results.length} {results.length === 1 ? 'instrumento aplicado' : 'instrumentos aplicados'}
        </span>
      }
    >
      <div className="dt-tabs" role="tablist" aria-label="Instrumentos aplicados">
        {results.map((result) => (
          <button
            key={result.instrument.id}
            type="button"
            role="tab"
            className="dt-tab"
            aria-selected={result.instrument.id === active.instrument.id}
            onClick={() => setActiveId(result.instrument.id)}
          >
            {result.instrument.nombre}
            <span className="dt-tab-count">
              {result.recorded}/{result.total}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5">
        <InstrumentResultPanel key={active.instrument.id} result={active} evaluationId={evaluation.id} />
      </div>

      <hr className="dt-divider" />

      <section aria-labelledby="interpretacion">
        <h3 id="interpretacion" className="dt-section-title">
          <PencilLine aria-hidden="true" />
          Interpretación profesional
        </h3>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: 'var(--dt-muted)' }}>
          Lectura psicopedagógica del conjunto: relaciona lo observado con los antecedentes y con el desempeño de cada
          área. Este texto pasa íntegro al apartado 6 del informe.
        </p>
        <div className="mt-4">
          <TextareaField
            label="Interpretación de los resultados"
            required
            value={evaluation.interpretation}
            onChange={(next) => update((current) => ({ ...current, interpretation: next }))}
            placeholder="Relaciona lo observado con los antecedentes y con el desempeño registrado en cada área…"
            rows={7}
          />
        </div>
      </section>

      <StepFooter step="resultados" />
    </StepCard>
  )
}

function InstrumentResultPanel({ result, evaluationId }: { result: InstrumentResult; evaluationId: string }) {
  const { instrument, rows, global } = result
  const isPdPt = instrument.scoringMode === 'pd_pt'
  const observations = rows.filter((row) => row.observations.trim().length > 0)

  return (
    <div className="dt-results">
      <aside className="dt-block">
        <h3 className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
          Resultado general
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--dt-muted)' }}>
          {instrument.nombre} · {instrument.subtitulo}
        </p>

        <div className="dt-score mt-5">
          <p className="dt-score-value">{global || !isPdPt ? result.pdTotal : '—'}</p>
          <p className="dt-score-caption">{isPdPt ? 'PD total' : 'Puntuación total'}</p>
        </div>

        <dl className="dt-meta-list mt-5">
          <div>
            <dt>Rango</dt>
            <dd>{global ? global.range : 'Pendiente de completar el registro'}</dd>
          </div>
          <div>
            <dt>Nivel</dt>
            <dd>{global ? global.level : '—'}</dd>
          </div>
          <div>
            <dt>Registro</dt>
            <dd>
              {result.recorded} de {result.total} {instrument.unidad.plural}
            </dd>
          </div>
        </dl>

        <Link
          href={`/evaluaciones/${evaluationId}/instrumentos/${instrument.id}`}
          className="dt-btn dt-btn-secondary dt-btn-block mt-5"
        >
          Ver interpretación
          <ArrowRight aria-hidden="true" />
        </Link>
      </aside>

      <div className="min-w-0">
        <h3 className="dt-section-title">
          <Calculator aria-hidden="true" />
          Protocolo de {instrument.unidad.plural}
        </h3>

        <div className="dt-table-wrap dt-scroll mt-3" style={{ border: '1px solid var(--dt-border)' }}>
          <table className="dt-table" data-compact="true">
            <caption className="dt-sr-only">Protocolo de {instrument.nombre}</caption>
            <thead>
              <tr>
                <th scope="col">{instrument.unidad.singular}</th>
                <th scope="col">{isPdPt ? 'PD' : 'Puntuación'}</th>
                {isPdPt ? <th scope="col">PT</th> : <th scope="col">Máximo</th>}
                {isPdPt ? <th scope="col">Clasificación</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.subtestId}>
                  <td style={{ color: 'var(--dt-text)', fontWeight: 600 }}>{row.nombre}</td>
                  <td>{row.pd ?? '—'}</td>
                  {isPdPt ? <td>{row.pt ?? '—'}</td> : <td>{row.max}</td>}
                  {isPdPt ? (
                    <td>
                      {row.classification ? (
                        <span
                          className="dt-badge"
                          data-tone={
                            row.classification.startsWith('BAJO')
                              ? 'danger'
                              : row.classification === 'ALTO'
                                ? 'success'
                                : 'neutral'
                          }
                        >
                          {row.classification}
                        </span>
                      ) : (
                        <span className="dt-badge" data-tone="warning">
                          Sin PT
                        </span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{result.pdTotal}</td>
                <td colSpan={isPdPt ? 2 : 1}>
                  {global ? `${global.range} · ${global.level}` : 'Se calcula al completar el registro.'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {result.notices.length > 0 ? (
          <ul className="mt-4 grid gap-2">
            {result.notices.map((notice) => (
              <li key={notice} className="dt-note" data-tone={notice.startsWith('Faltan') ? 'warning' : undefined}>
                {notice.startsWith('Faltan') ? <AlertTriangle aria-hidden="true" /> : <Info aria-hidden="true" />}
                {notice}
              </li>
            ))}
          </ul>
        ) : null}

        <InstrumentProfileChart result={result} />

        {observations.length > 0 ? (
          <>
            <h4 className="mt-5 text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
              Observaciones registradas
            </h4>
            <dl className="dt-meta-list mt-3">
              {observations.map((row) => (
                <div key={row.subtestId}>
                  <dt>{row.nombre}</dt>
                  <dd>{orDash(row.observations)}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : null}
      </div>

      <aside className="dt-block dt-results-scale">
        <h3 className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
          Baremo
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--dt-muted)' }}>
          Tabla publicada del instrumento.
        </p>
        <ul className="dt-results-scale-list mt-4">
          {instrument.baremos.map((baremo) => {
            const activeRow = global?.range === baremo.rango
            return (
              <li
                key={baremo.rango}
                className="dt-gate-item"
                data-complete={activeRow}
                style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}
              >
                <span className="dt-gate-body">
                  <strong>{baremo.rango}</strong>
                  <small>
                    {baremo.descripcion} · {baremo.nivel}
                  </small>
                </span>
              </li>
            )
          })}
        </ul>
        <p className="dt-note mt-4">
          <Info aria-hidden="true" />
          {instrument.normativeStatus}
        </p>
      </aside>
    </div>
  )
}

/**
 * Perfil del instrumento.
 *
 * Cada instrumento en su propia escala y con su reparto por banda arriba, que
 * es la lectura rápida: cuántas áreas caen bajo, medio y alto. Debajo, el
 * detalle ordenado de menor a mayor desempeño.
 */
function InstrumentProfileChart({ result }: { result: InstrumentResult }) {
  const profile = instrumentProfile(result)
  if (profile.points.length === 0) return null

  return (
    <section className="dt-block mt-5" aria-labelledby={`perfil-${result.instrument.id}`}>
      <h4 id={`perfil-${result.instrument.id}`} className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
        Perfil de {result.instrument.nombre}
      </h4>

      <ul className="dt-tally mt-3">
        {profile.distribution.map((slice) => (
          <li key={slice.band} className="dt-tally-item" data-band={slice.band}>
            <span className="dt-tally-count">{slice.count}</span>
            <span className="dt-tally-label">{slice.label}</span>
          </li>
        ))}
      </ul>

      <ul className="dt-bars mt-4">
        {profile.points.map((point, index) => (
          <li key={`${point.label}-${index}`}>
            <span className="dt-bars-label" title={point.label}>
              {point.label}
            </span>
            <span className="dt-bars-track">
              <span
                className="dt-bars-fill"
                style={{ width: `${Math.max(3, Math.round(point.ratio * 100))}%`, background: bandColor[point.band] }}
              />
            </span>
            <span className="dt-bars-value">{point.caption}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs" style={{ color: 'var(--dt-muted)' }}>
        {profile.scaleCaption}
        {profile.omitted > 0
          ? ` ${profile.omitted} ${profile.omitted === 1 ? 'medición queda' : 'mediciones quedan'} fuera del gráfico por no tener una escala comparable.`
          : ''}
      </p>
    </section>
  )
}
