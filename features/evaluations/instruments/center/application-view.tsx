'use client'

import { useEffect, useState } from 'react'
import { Check, Circle, Pause, Play, Square } from 'lucide-react'
import type { SessionUser } from '@/lib/auth/session'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import {
  applicationModeLabels,
  sessionLogLabels,
  sessionStatusLabels,
  type EvaluationInstrument,
  type SessionLogKind,
} from '@/lib/evaluations/model'
import { formatUpdatedAt } from '@/lib/evaluations/format'
import {
  addLogEntry,
  applicationTimeline,
  completeSubtest,
  recordTimerAction,
  setSubtestObservations,
  startSubtest,
  updateEntry,
} from '@/lib/instruments/battery'
import { availableTimerActions, formatDuration, formatStopwatch, sessionTiming } from '@/lib/instruments/session-timing'

/**
 * Estado de aplicación de un instrumento: cronómetro, subtests y bitácora.
 *
 * Funciona igual para una prueba en pantalla y para una que se aplica con
 * material físico: lo que se registra aquí es la sesión —cuándo empezó, cuánto
 * duró de verdad, qué subtests se recorrieron y qué pasó mientras— y eso ocurre
 * igual haya o no un cuestionario en el medio.
 *
 * El cronómetro que se ve es sólo la lectura de un reloj que vive en los
 * eventos guardados. Al recargar la página no se reinicia nada porque no hay
 * nada que reiniciar: se vuelve a calcular la misma duración desde el registro.
 *
 * `instrument-detail.tsx` la muestra como un bloque compacto dentro de la
 * misma pantalla, no como una pestaña propia: sólo cuando el modo de
 * aplicación todavía la necesita (no hay resultados importados).
 */
export function ApplicationWorkspace({
  entry,
  user,
}: {
  entry: EvaluationInstrument
  user: SessionUser
}) {
  const { update } = useEvaluation()
  const [, tick] = useState(0)

  const timing = sessionTiming(entry.events)
  const actions = availableTimerActions(timing)

  // El intervalo sólo empuja un repintado; el número lo sigue calculando el
  // reloj a partir de los eventos, así que no hay dos fuentes de verdad.
  useEffect(() => {
    if (!timing.running) return
    const id = window.setInterval(() => tick((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [timing.running])

  const change = (fn: (current: EvaluationInstrument) => EvaluationInstrument) =>
    update((current) => ({ ...current, battery: updateEntry(current.battery, entry.id, fn) }))

  const timer = (action: 'start' | 'pause' | 'resume' | 'finish') =>
    change((current) => recordTimerAction(current, action, user.id))

  return (
    <>
      <section className="dt-ai-section" aria-labelledby="aplicacion-title">
        <div className="dt-ai-section-head">
          <div>
            <div>
              <h3 id="aplicacion-title">{entry.name}</h3>
              <p>
                {applicationModeLabels[entry.applicationMode]} · {sessionStatusLabels[timing.status]}
              </p>
            </div>
          </div>
          <span className="dt-badge" data-tone={timing.status === 'COMPLETED' ? 'success' : 'warning'}>
            {sessionStatusLabels[timing.status]}
          </span>
        </div>

        <dl className="dt-center-figures">
          <div>
            <dt>Profesional</dt>
            <dd>{entry.professionalName || user.name}</dd>
          </div>
          <div>
            <dt>Inicio</dt>
            <dd>{timing.startedAt ? formatUpdatedAt(timing.startedAt) : 'Sin iniciar'}</dd>
          </div>
          <div>
            <dt>Duración efectiva</dt>
            <dd>{formatDuration(timing.activeMs)}</dd>
          </div>
        </dl>

        <div className="dt-stopwatch">
          <strong aria-live="off">{formatStopwatch(timing.activeMs)}</strong>
          <div className="dt-stopwatch-actions">
            {actions.canStart ? (
              <button type="button" className="dt-btn dt-btn-primary" onClick={() => timer('start')}>
                <Play aria-hidden="true" />
                Iniciar aplicación
              </button>
            ) : null}
            {actions.canPause ? (
              <button type="button" className="dt-btn dt-btn-secondary" onClick={() => timer('pause')}>
                <Pause aria-hidden="true" />
                Pausar
              </button>
            ) : null}
            {actions.canResume ? (
              <button type="button" className="dt-btn dt-btn-primary" onClick={() => timer('resume')}>
                <Play aria-hidden="true" />
                Reanudar
              </button>
            ) : null}
            {actions.canFinish ? (
              <button type="button" className="dt-btn dt-btn-secondary" onClick={() => timer('finish')}>
                <Square aria-hidden="true" />
                Finalizar aplicación
              </button>
            ) : null}
          </div>
        </div>

        <label className="dt-field">
          <span>Lugar o condiciones de aplicación</span>
          <input
            value={entry.location}
            placeholder="Sin registrar"
            onChange={(event) => change((current) => ({ ...current, location: event.target.value }))}
          />
        </label>
      </section>

      {entry.subtestRuns.length > 0 ? (
        <SubtestList entry={entry} onChange={change} />
      ) : null}

      <ApplicationLog entry={entry} professionalId={user.id} onChange={change} />
    </>
  )
}

function SubtestList({
  entry,
  onChange,
}: {
  entry: EvaluationInstrument
  onChange: (fn: (current: EvaluationInstrument) => EvaluationInstrument) => void
}) {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <section className="dt-ai-section" aria-labelledby="subtests-title">
      <div className="dt-ai-section-head">
        <div>
          <div>
            <h3 id="subtests-title">Subtests</h3>
            <p>
              {entry.subtestRuns.filter((run) => run.status === 'COMPLETED').length} de {entry.subtestRuns.length}{' '}
              recorridos
            </p>
          </div>
        </div>
      </div>

      <ol className="dt-subtest-list">
        {entry.subtestRuns.map((run) => (
          <li key={run.subtestId} data-status={run.status}>
            <span className="dt-subtest-mark" aria-hidden="true">
              {run.status === 'COMPLETED' ? <Check /> : <Circle />}
            </span>
            <span className="dt-subtest-name">{run.label}</span>
            <span className="dt-subtest-time">
              {run.durationMs > 0 ? formatStopwatch(run.durationMs) : run.status === 'IN_PROGRESS' ? 'En curso' : '—'}
            </span>
            <span className="dt-subtest-actions">
              {run.status === 'PENDING' ? (
                <button
                  type="button"
                  className="dt-btn dt-btn-secondary dt-btn-sm"
                  onClick={() => onChange((current) => startSubtest(current, run.subtestId))}
                >
                  Iniciar
                </button>
              ) : null}
              {run.status === 'IN_PROGRESS' ? (
                <button
                  type="button"
                  className="dt-btn dt-btn-primary dt-btn-sm"
                  onClick={() => onChange((current) => completeSubtest(current, run.subtestId))}
                >
                  Finalizar
                </button>
              ) : null}
              <button
                type="button"
                className="dt-btn dt-btn-ghost dt-btn-sm"
                onClick={() => setOpen((value) => (value === run.subtestId ? null : run.subtestId))}
              >
                Observaciones
              </button>
            </span>
            {open === run.subtestId ? (
              <span className="dt-subtest-notes">
                <textarea
                  rows={2}
                  value={run.observations}
                  placeholder="Observaciones de la ejecución de este subtest."
                  onChange={(event) =>
                    onChange((current) => setSubtestObservations(current, run.subtestId, event.target.value))
                  }
                />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * Registro de aplicación.
 *
 * Cada anotación lleva su hora y su tipo. Un único cuadro de texto al final
 * pierde el orden de los hechos —y en una aplicación el orden es la mitad de la
 * observación: no es lo mismo una interrupción al principio que en el último
 * subtest—.
 */
function ApplicationLog({
  entry,
  professionalId,
  onChange,
}: {
  entry: EvaluationInstrument
  professionalId: string
  onChange: (fn: (current: EvaluationInstrument) => EvaluationInstrument) => void
}) {
  const [kind, setKind] = useState<SessionLogKind>('OBSERVATION')
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)

  const timeline = applicationTimeline(entry, sessionLogLabels)
  const activeSubtest = entry.subtestRuns.find((run) => run.status === 'IN_PROGRESS')?.subtestId ?? null

  const submit = () => {
    if (!note.trim()) return
    onChange((current) => addLogEntry(current, { kind, note: note.trim(), subtestId: activeSubtest, professionalId }))
    setNote('')
    setAdding(false)
  }

  return (
    <section className="dt-ai-section" aria-labelledby="registro-title">
      <div className="dt-ai-section-head">
        <div>
          <div>
            <h3 id="registro-title">Registro de aplicación</h3>
            <p>Secuencia de la sesión y observaciones registradas.</p>
          </div>
        </div>
        <button type="button" className="dt-btn dt-btn-secondary dt-btn-sm" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancelar' : 'Registrar observación'}
        </button>
      </div>

      {adding ? (
        <div className="dt-log-form">
          <label className="dt-field">
            <span>Tipo</span>
            <select value={kind} onChange={(event) => setKind(event.target.value as SessionLogKind)}>
              {(Object.keys(sessionLogLabels) as SessionLogKind[]).map((option) => (
                <option key={option} value={option}>
                  {sessionLogLabels[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="dt-field">
            <span>Nota</span>
            <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <button
            type="button"
            className="dt-btn dt-btn-primary dt-btn-sm"
            disabled={!note.trim()}
            onClick={submit}
          >
            Registrar
          </button>
        </div>
      ) : null}

      {timeline.length === 0 ? (
        <div className="dt-ai-empty">
          <strong>Sin registro de aplicación.</strong>
          <p>El registro se completa al iniciar la aplicación y con cada observación anotada.</p>
        </div>
      ) : (
        <ol className="dt-timeline">
          {timeline.map((item) => (
            <li key={item.id} data-kind={item.kind}>
              <span className="dt-timeline-time">{new Date(item.at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="dt-timeline-label">{item.label}</span>
              {item.detail ? <span className="dt-timeline-detail">{item.detail}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
