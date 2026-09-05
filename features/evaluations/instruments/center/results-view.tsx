'use client'

import { useMemo, useState } from 'react'
import { PencilLine, Plus } from 'lucide-react'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import {
  applicationModeLabels,
  scoreFieldKindLabels,
  type EvaluationInstrument,
  type FunctionalAreaId,
  type InstrumentOrientation,
  type ScoreFieldKind,
} from '@/lib/evaluations/model'
import { formatLongDate } from '@/lib/evaluations/format'
import { functionalAreaSchema } from '@/lib/evaluations/functional-areas'
import { setScore, updateEntry } from '@/lib/instruments/battery'
import { comparisonPairs, instrumentProfileChart } from '@/lib/instruments/charts'
import { groupFieldsBySubtest, professionalMeasure, scoreCompleteness, scoreFieldsFor } from '@/lib/instruments/score-schema'
import { formatDuration, sessionTiming } from '@/lib/instruments/session-timing'
import { ComparisonChart, ProfileChart } from '@/features/evaluations/instruments/profile-chart'

/**
 * Secciones de resultados de un instrumento: qué se midió, cómo se lee y qué
 * se concluye. `instrument-detail.tsx` las compone una tras otra para el
 * instrumento seleccionado; viven aquí sueltas porque cada una es un bloque
 * probatorio distinto —una puntuación no es una interpretación, y una
 * interpretación no es una conclusión profesional.
 */

/** Pares de aplicaciones del mismo instrumento en la batería, si existen. */
export function hasComparison(battery: EvaluationInstrument[], entry: EvaluationInstrument): boolean {
  return comparisonPairs(battery).some((pair) => pair.instrumentId === entry.instrumentId)
}

/**
 * Áreas que informa el instrumento.
 *
 * Es lo que permite cruzar sus resultados con lo observado en el paso 4. Lo
 * declara el profesional porque es un juicio suyo: qué mide realmente esta
 * prueba en este caso no se deduce del nombre del archivo.
 */
export function AreaLinks({ entry }: { entry: EvaluationInstrument }) {
  const { update } = useEvaluation()

  const toggle = (areaId: FunctionalAreaId) =>
    update((current) => ({
      ...current,
      battery: updateEntry(current.battery, entry.id, (item) => ({
        ...item,
        linkedAreas: item.linkedAreas.includes(areaId)
          ? item.linkedAreas.filter((id) => id !== areaId)
          : [...item.linkedAreas, areaId],
      })),
    }))

  return (
    <section className="dt-ai-section" aria-labelledby="areas-instrumento-title">
      <div className="dt-ai-section-head">
        <div>
          <div>
            <h3 id="areas-instrumento-title">Áreas que informa</h3>
            <p>Determina con qué observaciones del expediente se cruzan estos resultados.</p>
          </div>
        </div>
        <span className="dt-badge" data-tone={entry.linkedAreas.length > 0 ? 'success' : 'warning'}>
          {entry.linkedAreas.length} vinculadas
        </span>
      </div>

      <div className="dt-area-links">
        {functionalAreaSchema.map((area) => (
          <button
            key={area.id}
            type="button"
            aria-pressed={entry.linkedAreas.includes(area.id)}
            data-active={entry.linkedAreas.includes(area.id)}
            onClick={() => toggle(area.id)}
          >
            {area.label}
          </button>
        ))}
      </div>

      {entry.linkedAreas.length === 0 ? (
        <p className="dt-hint">
          Sin áreas vinculadas, los resultados de este instrumento no entran en la matriz de evidencia.
        </p>
      ) : null}
    </section>
  )
}

export function ResultsHeader({ entry }: { entry: EvaluationInstrument }) {
  const timing = sessionTiming(entry.events)
  const validated = entry.report.status === 'APPROVED'

  return (
    <section className="dt-ai-section" aria-labelledby="resultados-title">
      <div className="dt-ai-section-head">
        <div>
          <div>
            <h3 id="resultados-title">{entry.name}</h3>
            <p>Resultados</p>
          </div>
        </div>
        <span className="dt-badge" data-tone={validated ? 'success' : 'warning'}>
          {validated ? 'Validado' : 'Pendiente de validación'}
        </span>
      </div>

      <dl className="dt-center-figures">
        <div>
          <dt>Modalidad</dt>
          <dd>{applicationModeLabels[entry.applicationMode]}</dd>
        </div>
        <div>
          <dt>Fecha</dt>
          <dd>{timing.startedAt ? formatLongDate(timing.startedAt) : 'Sin registrar'}</dd>
        </div>
        <div>
          <dt>Duración</dt>
          <dd>{timing.activeMs > 0 ? formatDuration(timing.activeMs) : 'Sin registrar'}</dd>
        </div>
      </dl>
    </section>
  )
}

/**
 * Registro de resultados. Los campos los declara el instrumento; cuando no
 * declara ninguno, el profesional puede añadir la medida que su protocolo pide,
 * y queda marcada como declarada por él.
 */
export function ScoreForm({ entry }: { entry: EvaluationInstrument }) {
  const { evaluation, update } = useEvaluation()
  const [reviewing, setReviewing] = useState(false)
  const [declaring, setDeclaring] = useState(false)
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<ScoreFieldKind>('DIRECT')
  const [unit, setUnit] = useState('')

  const fields = useMemo(
    () => scoreFieldsFor(entry, evaluation.instrumentBlueprints),
    [entry, evaluation.instrumentBlueprints],
  )
  const groups = groupFieldsBySubtest(fields)
  const completeness = scoreCompleteness(entry, fields)

  const write = (fieldId: string, value: string) =>
    update((current) => ({
      ...current,
      battery: updateEntry(current.battery, entry.id, (item) => setScore(item, fieldId, value)),
    }))

  const declare = () => {
    if (!label.trim() || !entry.blueprintId) return
    const measure = professionalMeasure({ label, kind, unit })
    update((current) => ({
      ...current,
      instrumentBlueprints: {
        ...current.instrumentBlueprints,
        [entry.blueprintId!]: {
          ...current.instrumentBlueprints[entry.blueprintId!],
          measures: [...current.instrumentBlueprints[entry.blueprintId!].measures, measure],
          updatedAt: new Date().toISOString(),
        },
      },
    }))
    setLabel('')
    setUnit('')
    setDeclaring(false)
  }

  return (
    <section className="dt-ai-section" aria-labelledby="registro-resultados-title">
      <div className="dt-ai-section-head">
        <div>
          <div>
            <h3 id="registro-resultados-title">Resultados</h3>
            <p>
              {fields.length === 0
                ? 'Detection AI todavia no detecta medidas calculables en este instrumento.'
                : `${completeness.recorded} de ${completeness.total} medidas detectadas`}
            </p>
          </div>
        </div>
        {entry.blueprintId ? (
          <button type="button" className="dt-btn dt-btn-ghost dt-btn-sm" onClick={() => setReviewing((v) => !v)}>
            <PencilLine aria-hidden="true" />
            {reviewing ? 'Ocultar revision' : 'Revisar medidas'}
          </button>
        ) : null}
      </div>

      {reviewing && declaring ? (
        <div className="dt-log-form">
          <label className="dt-field">
            <span>Medida</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Nombre de la medida" />
          </label>
          <label className="dt-field">
            <span>Tipo</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as ScoreFieldKind)}>
              {(Object.keys(scoreFieldKindLabels) as ScoreFieldKind[]).map((option) => (
                <option key={option} value={option}>
                  {scoreFieldKindLabels[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="dt-field">
            <span>Escala</span>
            <input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="p. ej. sobre 30" />
          </label>
          <button type="button" className="dt-btn dt-btn-primary dt-btn-sm" disabled={!label.trim()} onClick={declare}>
            Añadir
          </button>
        </div>
      ) : null}

      {fields.length === 0 ? (
        <div className="dt-ai-empty">
          <strong>Resultados pendientes de extraccion.</strong>
          <p>
            Si el material contiene respuestas o una hoja automatizada, Detection AI intentara digitalizarlas y
            calcularlas antes de pedir intervencion profesional.
          </p>
        </div>
      ) : reviewing ? (
        <div className="dt-score-groups">
          {entry.blueprintId ? (
            <div className="dt-ai-actions">
              <button type="button" className="dt-btn dt-btn-secondary dt-btn-sm" onClick={() => setDeclaring((v) => !v)}>
                <Plus aria-hidden="true" />
                Anadir medida manual
              </button>
            </div>
          ) : null}
          {groups.map((group) => (
            <fieldset key={group.subtestId ?? 'general'} className="dt-score-group">
              <legend>{group.label}</legend>
              {group.fields.map((field) => (
                <label key={field.id} className="dt-field">
                  <span>
                    {field.label}
                    {field.unit ? <small> · {field.unit}</small> : null}
                    {field.source === 'PROFESSIONAL' ? <small> · declarada</small> : null}
                  </span>
                  <input
                    inputMode="decimal"
                    value={entry.scores[field.id]?.value ?? ''}
                    placeholder="Sin registrar"
                    onChange={(event) => write(field.id, event.target.value)}
                  />
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      ) : completeness.recorded === 0 ? (
        <div className="dt-ai-empty">
          <strong>Medidas detectadas, sin valores procesados.</strong>
          <p>
            Cuando existan respuestas suficientes, el sistema calculara las puntuaciones y mostrara el perfil. La edicion
            manual queda reservada para datos faltantes o inconsistentes.
          </p>
        </div>
      ) : (
        <div className="dt-score-groups" data-readonly="true">
          {groups.map((group) => (
            <fieldset key={group.subtestId ?? 'general'} className="dt-score-group">
              <legend>{group.label}</legend>
              {group.fields.map((field) => (
                <div key={field.id} className="dt-field">
                  <span>
                    {field.label}
                    {field.unit ? <small> · {field.unit}</small> : null}
                  </span>
                  <strong>{entry.scores[field.id]?.value || 'Pendiente'}</strong>
                </div>
              ))}
            </fieldset>
          ))}
        </div>
      )}
    </section>
  )
}

export function ProfileSection({ entry }: { entry: EvaluationInstrument }) {
  const { evaluation } = useEvaluation()
  const chart = useMemo(
    () => instrumentProfileChart(entry, evaluation.instrumentBlueprints),
    [entry, evaluation.instrumentBlueprints],
  )

  if (chart.rows.length === 0) return null

  return (
    <section className="dt-ai-section" aria-labelledby="perfil-title">
      <div className="dt-ai-section-head">
        <div>
          <div>
            <h3 id="perfil-title">Perfil de resultados</h3>
          </div>
        </div>
      </div>
      <ProfileChart chart={chart} title={`Perfil · ${entry.name}`} />
    </section>
  )
}

export function ComparisonSection({ entry }: { entry: EvaluationInstrument }) {
  const { evaluation } = useEvaluation()
  const pair = comparisonPairs(evaluation.battery).find((item) => item.instrumentId === entry.instrumentId)
  if (!pair) return null

  const beforeChart = instrumentProfileChart(pair.before.entry, evaluation.instrumentBlueprints)
  const afterChart = instrumentProfileChart(pair.after.entry, evaluation.instrumentBlueprints)

  const rows = beforeChart.rows.map((row) => {
    const after = afterChart.rows.find((item) => item.id === row.id)
    const scale = row.ratio > 0 ? row.value / row.ratio : 0
    return {
      id: row.id,
      label: row.label,
      before: row.value,
      after: after ? after.value : null,
      scale,
      unit: '',
    }
  })

  return (
    <section className="dt-ai-section" aria-labelledby="comparacion-title">
      <div className="dt-ai-section-head">
        <div>
          <div>
            <h3 id="comparacion-title">Comparación entre aplicaciones</h3>
          </div>
        </div>
      </div>
      <ComparisonChart title={`Evolución · ${pair.name}`} rows={rows} />
    </section>
  )
}

/**
 * Interpretación y conclusión. Detection AI puede dejar un borrador, pero el
 * texto no llega al informe mientras alguien no lo asuma: el estado del texto
 * dice siempre si lo ha revisado un profesional.
 */
export function NarrativeSection({
  entry,
  field,
  title,
}: {
  entry: EvaluationInstrument
  field: 'interpretation' | 'conclusion'
  title: string
}) {
  const { update } = useEvaluation()
  const [editing, setEditing] = useState(false)
  const narrative = entry[field]

  const write = (text: string) =>
    update((current) => ({
      ...current,
      battery: updateEntry(current.battery, entry.id, (item) => ({
        ...item,
        [field]: {
          ...item[field],
          text,
          status: text.trim() ? ('EDITED' as const) : ('EMPTY' as const),
          updatedAt: new Date().toISOString(),
        },
      })),
    }))

  const statusLabel =
    narrative.status === 'APPROVED'
      ? 'Aprobada'
      : narrative.status === 'AI_DRAFT'
        ? 'Borrador Detection AI'
        : narrative.status === 'EDITED'
          ? 'Redactada'
          : 'Pendiente'

  const emptyCopy =
    field === 'interpretation'
      ? 'Se generara automaticamente cuando existan resultados validados y evidencia suficiente.'
      : 'Se generara automaticamente a partir de los resultados, el contexto y las limitaciones disponibles.'

  return (
    <section className="dt-ai-section">
      <div className="dt-ai-section-head">
        <div>
          <div>
            <h3>{title}</h3>
          </div>
        </div>
        <span className="dt-badge" data-tone={narrative.status === 'APPROVED' ? 'success' : 'neutral'}>
          {statusLabel}
        </span>
      </div>
      {!narrative.text.trim() && !editing ? (
        <div className="dt-ai-empty">
          <strong>Borrador Detection AI pendiente.</strong>
          <p>{emptyCopy}</p>
        </div>
      ) : null}

      {narrative.text.trim() && !editing ? (
        <div className="dt-ai-generated-text">
          <p>{narrative.text}</p>
        </div>
      ) : null}

      {editing ? (
        <textarea
          className="dt-narrative"
          rows={5}
          value={narrative.text}
          placeholder={field === 'interpretation' ? 'Borrador asistido de interpretacion.' : 'Borrador asistido de conclusion.'}
          onChange={(event) => write(event.target.value)}
        />
      ) : null}

      <div className="dt-ai-actions">
        <button type="button" className="dt-btn dt-btn-secondary dt-btn-sm" onClick={() => setEditing((value) => !value)}>
          <PencilLine aria-hidden="true" />
          {editing ? 'Cerrar edicion' : narrative.text.trim() ? 'Editar' : 'Editar manualmente'}
        </button>
      </div>
    </section>
  )
}

export function OrientationsSection({ entry }: { entry: EvaluationInstrument }) {
  const { update } = useEvaluation()
  const [reviewing, setReviewing] = useState(false)
  const [text, setText] = useState('')

  const change = (fn: (current: EvaluationInstrument) => EvaluationInstrument) =>
    update((current) => ({ ...current, battery: updateEntry(current.battery, entry.id, fn) }))

  const add = () => {
    if (!text.trim()) return
    const orientation: InstrumentOrientation = {
      id: crypto.randomUUID(),
      text: text.trim(),
      status: 'EDITED',
      group: null,
      createdAt: new Date().toISOString(),
    }
    change((current) => ({ ...current, orientations: [...current.orientations, orientation] }))
    setText('')
  }

  const setStatus = (id: string, status: InstrumentOrientation['status']) =>
    change((current) => ({
      ...current,
      orientations: current.orientations.map((item) => (item.id === id ? { ...item, status } : item)),
    }))

  return (
    <section className="dt-ai-section" aria-labelledby="orientaciones-title">
      <div className="dt-ai-section-head">
        <div>
          <div>
            <h3 id="orientaciones-title">Orientaciones derivadas del instrumento</h3>
            <p>Detection AI las propone; el profesional acepta, edita o descarta.</p>
          </div>
        </div>
      </div>

      {entry.orientations.length === 0 ? (
        <div className="dt-ai-empty">
          <strong>Orientaciones sugeridas pendientes.</strong>
          <p>Se generaran cuando existan resultados interpretables del instrumento.</p>
        </div>
      ) : (
        <ul className="dt-orientations">
          {entry.orientations.map((item) => (
            <li key={item.id} data-status={item.status}>
              <p>{item.text}</p>
              <div className="dt-orientation-actions">
                <span className="dt-badge" data-tone={item.status === 'ACCEPTED' ? 'success' : item.status === 'DISCARDED' ? 'neutral' : 'warning'}>
                  {item.status === 'AI_DRAFT'
                    ? 'Borrador Detection AI'
                    : item.status === 'ACCEPTED'
                      ? 'Aceptada'
                      : item.status === 'DISCARDED'
                        ? 'Descartada'
                        : 'Redactada'}
                </span>
                {item.status !== 'ACCEPTED' ? (
                  <button
                    type="button"
                    className="dt-btn dt-btn-secondary dt-btn-sm"
                    onClick={() => setStatus(item.id, 'ACCEPTED')}
                  >
                    Aceptar
                  </button>
                ) : null}
                {item.status !== 'DISCARDED' ? (
                  <button
                    type="button"
                    className="dt-btn dt-btn-ghost dt-btn-sm"
                    onClick={() => setStatus(item.id, 'DISCARDED')}
                  >
                    Descartar
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="dt-ai-actions">
        <button type="button" className="dt-btn dt-btn-secondary dt-btn-sm" onClick={() => setReviewing((value) => !value)}>
          <PencilLine aria-hidden="true" />
          {reviewing ? 'Ocultar edicion' : 'Anadir orientacion manual'}
        </button>
      </div>

      {reviewing ? (
        <div className="dt-log-form">
          <label className="dt-field">
            <span>Orientacion manual</span>
            <textarea rows={2} value={text} onChange={(event) => setText(event.target.value)} />
          </label>
          <button type="button" className="dt-btn dt-btn-primary dt-btn-sm" disabled={!text.trim()} onClick={add}>
            Anadir
          </button>
        </div>
      ) : null}
    </section>
  )
}
