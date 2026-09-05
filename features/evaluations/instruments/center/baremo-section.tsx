'use client'

import { useMemo, useState } from 'react'
import { Check, PencilLine, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { useSession } from '@/lib/auth/session-context'
import type { BaremoBand, EvaluationInstrument, InstrumentBlueprint } from '@/lib/evaluations/model'
import {
  confirmBaremo,
  createBaremo,
  emptyBaremoBand,
  removeBaremo,
  reopenBaremo,
  upsertBaremo,
} from '@/lib/instruments/blueprint-validation'
import { scoreInstrument, type ComputedMeasure } from '@/lib/instruments/scoring/instrument-scoring-engine'

/**
 * Baremo y resultado calculado.
 *
 * El baremo no se extrae solo de la hoja de cálculo: adivinar una tabla
 * numérica mal es un baremo inventado con apariencia de dato leído. Aquí el
 * profesional transcribe los tramos que ve en el material original y los
 * confirma; sólo entonces el motor de cálculo (`instrument-scoring-engine.ts`)
 * los usa. Nada de esto llama a un modelo de lenguaje: es aritmética sobre
 * datos que alguien ya validó.
 */
export function BaremoSection({ entry }: { entry: EvaluationInstrument }) {
  const { evaluation, update } = useEvaluation()
  const { user } = useSession()
  const [reviewing, setReviewing] = useState(false)
  const [addingFor, setAddingFor] = useState<string | null>(null)

  const blueprint = entry.blueprintId ? evaluation.instrumentBlueprints[entry.blueprintId] : null
  const result = useMemo(() => scoreInstrument(blueprint ?? null, entry), [blueprint, entry])

  if (!blueprint || blueprint.measures.length === 0) return null

  const change = (fn: (blueprint: InstrumentBlueprint) => InstrumentBlueprint) =>
    update((current) => ({
      ...current,
      instrumentBlueprints: { ...current.instrumentBlueprints, [blueprint.id]: fn(blueprint) },
    }))

  const addBaremo = (sourceMeasureId: string) => {
    change((current) => upsertBaremo(current, createBaremo({ sourceMeasureId })))
    setAddingFor(null)
  }

  const measuresWithoutBaremo = blueprint.measures.filter(
    (measure) => !blueprint.baremos.some((baremo) => baremo.sourceMeasureId === measure.id),
  )

  return (
    <section className="dt-ai-section" aria-labelledby="baremo-title">
      <div className="dt-ai-section-head">
        <div>
          <div>
            <h3 id="baremo-title">Baremos detectados</h3>
            <p>Detection AI intenta extraer tablas desde Excel, manuales y material de correccion; el profesional valida.</p>
          </div>
        </div>
        {measuresWithoutBaremo.length > 0 ? (
          <button
            type="button"
            className="dt-btn dt-btn-ghost dt-btn-sm"
            onClick={() => setReviewing((value) => !value)}
          >
            <PencilLine aria-hidden="true" />
            {reviewing ? 'Ocultar revision' : 'Revisar baremos'}
          </button>
        ) : null}
      </div>

      {reviewing && measuresWithoutBaremo.length > 0 ? (
        <div className="dt-ai-actions">
          <button type="button" className="dt-btn dt-btn-secondary dt-btn-sm" onClick={() => setAddingFor(measuresWithoutBaremo[0].id)}>
            <Plus aria-hidden="true" />
            Anadir baremo manual
          </button>
        </div>
      ) : null}

      {reviewing && addingFor ? (
        <div className="dt-log-form">
          <label className="dt-field">
            <span>Medida de entrada</span>
            <select value={addingFor} onChange={(event) => setAddingFor(event.target.value)}>
              {measuresWithoutBaremo.map((measure) => (
                <option key={measure.id} value={measure.id}>
                  {measure.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="dt-btn dt-btn-primary dt-btn-sm" onClick={() => addBaremo(addingFor)}>
            Crear
          </button>
          <button type="button" className="dt-btn dt-btn-ghost dt-btn-sm" onClick={() => setAddingFor(null)}>
            Cancelar
          </button>
        </div>
      ) : null}

      {blueprint.baremos.length === 0 ? (
        <div className="dt-ai-empty">
          <strong>Sin baremo validado todavia.</strong>
          <p>Si el paquete contiene tablas normativas, apareceran aqui como candidatos para revisar y confirmar.</p>
        </div>
      ) : (
        blueprint.baremos.map((baremo) => {
          const measure = blueprint.measures.find((item) => item.id === baremo.sourceMeasureId)
          return (
            <article key={baremo.id} className="dt-baremo-card">
              <header>
                <div>
                  <strong>{measure?.label ?? baremo.sourceMeasureId}</strong>
                  {baremo.scope ? <small>{baremo.scope}</small> : null}
                </div>
                <span className="dt-badge" data-tone={baremo.confirmedAt ? 'success' : 'warning'}>
                  {baremo.confirmedAt ? 'Confirmado' : 'Sin confirmar'}
                </span>
              </header>

              <BandTable
                bands={baremo.bands}
                editable={!baremo.confirmedAt}
                onChange={(bands) => change((current) => upsertBaremo(current, { ...baremo, bands }))}
              />

              <div className="dt-ai-actions">
                {baremo.confirmedAt ? (
                  <button
                    type="button"
                    className="dt-btn dt-btn-secondary dt-btn-sm"
                    onClick={() => change((current) => reopenBaremo(current, baremo.id))}
                  >
                    <RotateCcw aria-hidden="true" />
                    Volver a editar
                  </button>
                ) : (
                  <button
                    type="button"
                    className="dt-btn dt-btn-primary dt-btn-sm"
                    disabled={baremo.bands.length === 0}
                    onClick={() => change((current) => confirmBaremo(current, baremo.id, user))}
                  >
                    <Check aria-hidden="true" />
                    Confirmar baremo
                  </button>
                )}
                <button
                  type="button"
                  className="dt-icon-btn"
                  aria-label="Quitar baremo"
                  onClick={() => change((current) => removeBaremo(current, baremo.id))}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            </article>
          )
        })
      )}

      {result ? <ComputedResult result={result} /> : blueprint.status !== 'VALIDATED' ? (
        <p className="dt-hint">Valida el instrumento (Informe) para habilitar el cálculo automático.</p>
      ) : null}
    </section>
  )
}

function BandTable({
  bands,
  editable,
  onChange,
}: {
  bands: BaremoBand[]
  editable: boolean
  onChange: (bands: BaremoBand[]) => void
}) {
  const update = (id: string, patch: Partial<BaremoBand>) =>
    onChange(bands.map((band) => (band.id === id ? { ...band, ...patch } : band)))

  const remove = (id: string) => onChange(bands.filter((band) => band.id !== id))

  return (
    <div className="dt-table-wrap dt-scroll">
      <table className="dt-table" data-compact="true">
        <thead>
          <tr>
            <th>Mín.</th>
            <th>Máx.</th>
            <th>Transformada</th>
            <th>Percentil</th>
            <th>Clasificación</th>
            {editable ? <th /> : null}
          </tr>
        </thead>
        <tbody>
          {bands.map((band) => (
            <tr key={band.id}>
              <td>
                <NumberCell value={band.min} editable={editable} onChange={(value) => update(band.id, { min: value })} />
              </td>
              <td>
                <NumberCell value={band.max} editable={editable} onChange={(value) => update(band.id, { max: value })} />
              </td>
              <td>
                <NumberCell
                  value={band.scaledValue}
                  editable={editable}
                  onChange={(value) => update(band.id, { scaledValue: value })}
                />
              </td>
              <td>
                <NumberCell
                  value={band.percentile}
                  editable={editable}
                  onChange={(value) => update(band.id, { percentile: value })}
                />
              </td>
              <td>
                {editable ? (
                  <input
                    value={band.classification}
                    placeholder="p. ej. Adecuado"
                    onChange={(event) => update(band.id, { classification: event.target.value })}
                  />
                ) : (
                  band.classification || '—'
                )}
              </td>
              {editable ? (
                <td>
                  <button type="button" className="dt-icon-btn" aria-label="Quitar tramo" onClick={() => remove(band.id)}>
                    <Trash2 aria-hidden="true" />
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {editable ? (
        <button
          type="button"
          className="dt-btn dt-btn-ghost dt-btn-sm"
          onClick={() => onChange([...bands, emptyBaremoBand()])}
        >
          <Plus aria-hidden="true" />
          Añadir tramo
        </button>
      ) : null}
    </div>
  )
}

function NumberCell({
  value,
  editable,
  onChange,
}: {
  value: number | null
  editable: boolean
  onChange: (value: number | null) => void
}) {
  if (!editable) return <>{value ?? '—'}</>
  return (
    <input
      inputMode="decimal"
      value={value ?? ''}
      placeholder="—"
      onChange={(event) => {
        const raw = event.target.value.trim()
        onChange(raw ? Number(raw) : null)
      }}
    />
  )
}

function ComputedResult({ result }: { result: NonNullable<ReturnType<typeof scoreInstrument>> }) {
  const rows = [
    ...(result.overall ? [result.overall] : []),
    ...result.indices,
    ...result.subscales,
  ]

  return (
    <div className="dt-computed-result">
      <h4>Resultado calculado</h4>
      {rows.length === 0 && result.otherMeasures.length === 0 ? (
        <p className="dt-hint">Sin puntuaciones registradas todavía.</p>
      ) : (
        <div className="dt-table-wrap dt-scroll">
          <table className="dt-table" data-compact="true">
            <thead>
              <tr>
                <th>Medida</th>
                <th>PD</th>
                <th>Transformada</th>
                <th>Percentil</th>
                <th>Clasificación</th>
              </tr>
            </thead>
            <tbody>
              {[...rows, ...result.otherMeasures].map((row: ComputedMeasure) => (
                <tr key={row.measureId}>
                  <td>{row.label}</td>
                  <td>{row.rawScore ?? '—'}</td>
                  <td>{row.computable ? row.scaledScore ?? '—' : <span className="dt-hint">{row.reason}</span>}</td>
                  <td>{row.computable ? row.percentile ?? '—' : '—'}</td>
                  <td>{row.computable ? row.classification ?? '—' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
