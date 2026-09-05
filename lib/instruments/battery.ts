import type {
  ApplicationMode,
  EvaluationInstrument,
  Evaluation,
  SessionLogKind,
  SessionStatus,
} from '@/lib/evaluations/model'
import {
  createEvaluationInstrument,
  createSessionEvent,
  createSessionLogEntry,
} from '@/lib/evaluations/model'
import { batteryDuration, sessionTiming } from '@/lib/instruments/session-timing'

/**
 * Operaciones sobre la batería de evaluación.
 *
 * Una batería es una lista ordenada de instrumentos aplicados a un caso, no un
 * instrumento con partes. Cada entrada lleva su propio reloj, su propio registro
 * de aplicación y sus propios resultados, y puede aplicarse de tres maneras
 * distintas sin que ninguna sea la de segunda categoría.
 *
 * Todas las funciones devuelven una batería nueva. Ninguna escribe en el
 * almacén: eso lo hace quien llama, con la misma transacción que el resto del
 * expediente.
 */

export type BatteryEntryTiming = EvaluationInstrument & {
  timing: ReturnType<typeof sessionTiming>
}

/** La batería siempre se lee en su orden, y el orden es contiguo. */
export function sortedBattery(battery: EvaluationInstrument[]): EvaluationInstrument[] {
  return [...battery].sort((a, b) => a.order - b.order)
}

/**
 * Numera por posición en el array, sin reordenar.
 *
 * Ordenar aquí por el `order` anterior deshacía cualquier movimiento: quien
 * llama ya ha colocado las entradas donde deben quedar, y volver a ordenarlas
 * por el número viejo las devolvía a su sitio antes de renumerarlas. La entrada
 * a esta función es el orden deseado; el `order` es sólo su consecuencia.
 */
function renumber(battery: EvaluationInstrument[]): EvaluationInstrument[] {
  return battery.map((entry, index) => ({ ...entry, order: index + 1 }))
}

function touch(entry: EvaluationInstrument): EvaluationInstrument {
  return { ...entry, updatedAt: new Date().toISOString() }
}

export function addToBattery(
  battery: EvaluationInstrument[],
  input: {
    instrumentId: string
    name: string
    subtitle?: string
    blueprintId?: string | null
    applicationMode: ApplicationMode
    professionalId: string
    professionalName: string
    subtests?: Array<{ id: string; label: string }>
    linkedAreas?: EvaluationInstrument['linkedAreas']
  },
): EvaluationInstrument[] {
  const entry = createEvaluationInstrument({ ...input, order: battery.length + 1 })
  return renumber([...sortedBattery(battery), entry])
}

export function removeFromBattery(battery: EvaluationInstrument[], id: string): EvaluationInstrument[] {
  return renumber(sortedBattery(battery).filter((entry) => entry.id !== id))
}

/**
 * Mueve una entrada una posición. El orden de aplicación es una decisión
 * profesional -qué conviene aplicar antes, qué cansa más- y por eso se puede
 * cambiar mientras la prueba no haya empezado a contar.
 */
export function moveInBattery(
  battery: EvaluationInstrument[],
  id: string,
  direction: 'up' | 'down',
): EvaluationInstrument[] {
  const sorted = sortedBattery(battery)
  const index = sorted.findIndex((entry) => entry.id === id)
  if (index === -1) return battery

  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= sorted.length) return battery

  const next = [...sorted]
  ;[next[index], next[target]] = [next[target], next[index]]
  return renumber(next)
}

export function updateEntry(
  battery: EvaluationInstrument[],
  id: string,
  change: (entry: EvaluationInstrument) => EvaluationInstrument,
): EvaluationInstrument[] {
  return battery.map((entry) => (entry.id === id ? touch(change(entry)) : entry))
}

// ------------------------------------------------------------------- reloj

/**
 * Registra una acción de reloj. La duración no se toca: se deriva del registro
 * de eventos, así que aquí sólo se añade lo que ocurrió y cuándo.
 */
export function recordTimerAction(
  entry: EvaluationInstrument,
  action: 'start' | 'pause' | 'resume' | 'finish',
  professionalId: string,
): EvaluationInstrument {
  const kind = action === 'finish' ? 'END' : (action.toUpperCase() as 'START' | 'PAUSE' | 'RESUME')
  const events = [...entry.events, createSessionEvent(kind, professionalId)]
  return { ...entry, events, status: sessionTiming(events).status }
}

/** Estado derivado del reloj. La entrada nunca guarda un estado que lo contradiga. */
export function entryStatus(entry: EvaluationInstrument): SessionStatus {
  return sessionTiming(entry.events).status
}

// -------------------------------------------------- registro de aplicación

export function addLogEntry(
  entry: EvaluationInstrument,
  input: { kind: SessionLogKind; note: string; subtestId?: string | null; professionalId: string },
): EvaluationInstrument {
  return { ...entry, log: [...entry.log, createSessionLogEntry(input)] }
}

export function removeLogEntry(entry: EvaluationInstrument, logId: string): EvaluationInstrument {
  return { ...entry, log: entry.log.filter((item) => item.id !== logId) }
}

export type TimelineItem = {
  id: string
  at: string
  label: string
  detail: string
  kind: 'clock' | 'log'
}

const clockLabels = {
  START: 'Inicio de aplicación',
  PAUSE: 'Pausa',
  RESUME: 'Reanudación',
  END: 'Fin de aplicación',
} as const

/**
 * Línea temporal de la aplicación: los eventos de reloj y las observaciones en
 * una sola secuencia. Es lo que permite leer después cómo transcurrió la sesión
 * y no sólo cuánto duró.
 */
export function applicationTimeline(entry: EvaluationInstrument, logLabels: Record<SessionLogKind, string>): TimelineItem[] {
  const clock: TimelineItem[] = entry.events.map((event) => ({
    id: event.id,
    at: event.at,
    label: clockLabels[event.kind],
    detail: '',
    kind: 'clock',
  }))

  const notes: TimelineItem[] = entry.log.map((item) => ({
    id: item.id,
    at: item.at,
    label: logLabels[item.kind],
    detail: item.note,
    kind: 'log',
  }))

  return [...clock, ...notes].sort((a, b) => a.at.localeCompare(b.at))
}

// ------------------------------------------------------------------ subtests

export function startSubtest(entry: EvaluationInstrument, subtestId: string): EvaluationInstrument {
  const now = new Date().toISOString()
  return {
    ...entry,
    subtestRuns: entry.subtestRuns.map((run) =>
      run.subtestId === subtestId && run.status === 'PENDING'
        ? { ...run, status: 'IN_PROGRESS', startedAt: now }
        : run,
    ),
  }
}

export function completeSubtest(entry: EvaluationInstrument, subtestId: string): EvaluationInstrument {
  const now = new Date().toISOString()
  return {
    ...entry,
    subtestRuns: entry.subtestRuns.map((run) => {
      if (run.subtestId !== subtestId || run.status === 'COMPLETED') return run
      const started = run.startedAt ? new Date(run.startedAt).getTime() : null
      const durationMs = started ? Math.max(0, Date.now() - started) : run.durationMs
      return { ...run, status: 'COMPLETED', completedAt: now, durationMs }
    }),
  }
}

export function setSubtestObservations(
  entry: EvaluationInstrument,
  subtestId: string,
  observations: string,
): EvaluationInstrument {
  return {
    ...entry,
    subtestRuns: entry.subtestRuns.map((run) => (run.subtestId === subtestId ? { ...run, observations } : run)),
  }
}

// --------------------------------------------------------------- resultados

export function setScore(entry: EvaluationInstrument, fieldId: string, value: string): EvaluationInstrument {
  return {
    ...entry,
    scores: { ...entry.scores, [fieldId]: { fieldId, value, updatedAt: new Date().toISOString() } },
  }
}

// ------------------------------------------------------------------ resumen

export type BatterySummary = {
  planned: number
  completed: number
  inProgress: number
  pending: number
  awaitingReview: number
  totalDurationMs: number
  /** Instrumentos con al menos una medida registrada. */
  withResults: number
}

/**
 * Estado real de la evaluación instrumental. Todo se cuenta sobre lo que hay:
 * si no hay batería, todo es cero, y cero es un estado legítimo.
 */
export function batterySummary(battery: EvaluationInstrument[], now: number = Date.now()): BatterySummary {
  const statuses = battery.map((entry) => sessionTiming(entry.events, now).status)

  return {
    planned: battery.length,
    completed: statuses.filter((status) => status === 'COMPLETED').length,
    inProgress: statuses.filter((status) => status === 'IN_PROGRESS' || status === 'PAUSED').length,
    pending: statuses.filter((status) => status === 'PENDING').length,
    awaitingReview: battery.filter(
      (entry) => sessionTiming(entry.events, now).status === 'COMPLETED' && entry.report.status !== 'APPROVED',
    ).length,
    totalDurationMs: batteryDuration(battery, now),
    withResults: battery.filter((entry) => Object.values(entry.scores).some((score) => score.value.trim())).length,
  }
}

/** Instrumentos de la batería que ya pueden alimentar el informe general. */
export function approvedInstruments(battery: EvaluationInstrument[]): EvaluationInstrument[] {
  return sortedBattery(battery).filter((entry) => entry.report.status === 'APPROVED')
}

/** Respaldos de una entrada, resueltos contra el expediente. */
export function backupsOf(evaluation: Evaluation, entryId: string) {
  return evaluation.backups.filter((backup) => backup.evaluationInstrumentId === entryId)
}
