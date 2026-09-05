import type { EvaluationInstrument, SessionEvent, SessionStatus } from '@/lib/evaluations/model'

/**
 * Reloj de una aplicación, derivado de sus eventos.
 *
 * El tiempo no se guarda como un contador que alguien incrementa. Un contador
 * vive en la pestaña: si el profesional recarga, cambia de pantalla o se le
 * cierra el navegador a media prueba, el número se pierde o se duplica, y una
 * duración de aplicación que no se puede sostener no sirve para un informe.
 *
 * Lo que se guarda es la secuencia de START, PAUSE, RESUME y END con su hora.
 * La duración activa se recalcula sumando los tramos abiertos: el resultado es
 * el mismo se mire cuando se mire y desde donde se mire, y el registro explica
 * por sí solo qué pasó durante la sesión.
 */

export type SessionTiming = {
  startedAt: string | null
  /** Hora de la última pausa vigente; `null` si no está pausada. */
  pausedAt: string | null
  completedAt: string | null
  /** Milisegundos de aplicación efectiva, sin contar las pausas. */
  activeMs: number
  /** `true` mientras el reloj corre. */
  running: boolean
  status: SessionStatus
}

/** Los eventos se leen en orden cronológico, no en orden de inserción. */
function ordered(events: SessionEvent[]): SessionEvent[] {
  return [...events].sort((a, b) => a.at.localeCompare(b.at))
}

export function sessionTiming(events: SessionEvent[], now: number = Date.now()): SessionTiming {
  const sorted = ordered(events)

  let startedAt: string | null = null
  let completedAt: string | null = null
  let openedAt: number | null = null
  let pausedAt: string | null = null
  let activeMs = 0

  for (const event of sorted) {
    const at = new Date(event.at).getTime()
    if (!Number.isFinite(at)) continue

    switch (event.kind) {
      case 'START':
        // Un segundo START no reinicia nada: la aplicación ya empezó.
        if (startedAt === null) startedAt = event.at
        if (openedAt === null && completedAt === null) {
          openedAt = at
          pausedAt = null
        }
        break

      case 'RESUME':
        if (completedAt !== null) break
        if (openedAt === null) {
          openedAt = at
          pausedAt = null
        }
        break

      case 'PAUSE':
        if (openedAt !== null) {
          activeMs += Math.max(0, at - openedAt)
          openedAt = null
          pausedAt = event.at
        }
        break

      case 'END':
        if (openedAt !== null) {
          activeMs += Math.max(0, at - openedAt)
          openedAt = null
        }
        pausedAt = null
        completedAt = event.at
        break
    }
  }

  // El tramo abierto se cierra contra «ahora» sólo para mostrarlo; no se guarda.
  const running = openedAt !== null && completedAt === null
  if (running && openedAt !== null) activeMs += Math.max(0, now - openedAt)

  const status: SessionStatus = completedAt
    ? 'COMPLETED'
    : running
      ? 'IN_PROGRESS'
      : startedAt
        ? 'PAUSED'
        : 'PENDING'

  return { startedAt, pausedAt, completedAt, activeMs, running, status }
}

/** Qué acciones de reloj tienen sentido en el estado actual. */
export function availableTimerActions(timing: SessionTiming) {
  return {
    canStart: timing.startedAt === null,
    canPause: timing.running,
    canResume: !timing.running && timing.startedAt !== null && timing.completedAt === null,
    canFinish: timing.startedAt !== null && timing.completedAt === null,
  }
}

/** `1 h 42 min`, `24 min`, `18 s`. Sin ceros de relleno que nadie lee. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 min'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`
  if (minutes > 0) return `${minutes} min`
  return `${seconds} s`
}

/** `00:18:42`. El formato del cronómetro en pantalla, que sí necesita precisión. */
export function formatStopwatch(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

/** Tiempo total registrado en la batería. Suma de aplicaciones, no estimación. */
export function batteryDuration(battery: EvaluationInstrument[], now: number = Date.now()): number {
  return battery.reduce((total, entry) => total + sessionTiming(entry.events, now).activeMs, 0)
}
