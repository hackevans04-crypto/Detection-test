import { describe, expect, it } from 'vitest'
import type { SessionEvent, SessionEventKind } from '@/lib/evaluations/model'
import {
  availableTimerActions,
  formatDuration,
  formatStopwatch,
  sessionTiming,
} from '@/lib/instruments/session-timing'

const base = Date.parse('2026-09-02T10:00:00.000Z')
const minutes = (n: number) => n * 60_000

function event(kind: SessionEventKind, offsetMinutes: number): SessionEvent {
  return {
    id: `${kind}-${offsetMinutes}`,
    kind,
    at: new Date(base + minutes(offsetMinutes)).toISOString(),
    professionalId: 'prof-1',
  }
}

describe('reloj de aplicación', () => {
  it('no cuenta tiempo antes de iniciar', () => {
    const timing = sessionTiming([], base)
    expect(timing).toMatchObject({ status: 'PENDING', activeMs: 0, running: false, startedAt: null })
  })

  it('cuenta el tramo abierto contra el momento actual', () => {
    const timing = sessionTiming([event('START', 0)], base + minutes(18))
    expect(timing.activeMs).toBe(minutes(18))
    expect(timing.running).toBe(true)
    expect(timing.status).toBe('IN_PROGRESS')
  })

  it('descuenta las pausas', () => {
    const events = [event('START', 0), event('PAUSE', 10), event('RESUME', 25), event('END', 30)]
    const timing = sessionTiming(events, base + minutes(120))

    expect(timing.activeMs).toBe(minutes(15))
    expect(timing.status).toBe('COMPLETED')
    expect(timing.running).toBe(false)
  })

  it('no avanza mientras está en pausa, por mucho que pase el tiempo', () => {
    const events = [event('START', 0), event('PAUSE', 10)]

    expect(sessionTiming(events, base + minutes(11)).activeMs).toBe(minutes(10))
    expect(sessionTiming(events, base + minutes(600)).activeMs).toBe(minutes(10))
    expect(sessionTiming(events, base + minutes(600)).status).toBe('PAUSED')
  })

  it('da el mismo resultado en cualquier recálculo: recargar no reinicia el tiempo', () => {
    const events = [event('START', 0), event('PAUSE', 12), event('RESUME', 20), event('END', 44)]

    const primera = sessionTiming(events, base + minutes(45))
    const segunda = sessionTiming(events, base + minutes(4000))

    expect(primera.activeMs).toBe(minutes(36))
    expect(segunda.activeMs).toBe(primera.activeMs)
  })

  it('ordena los eventos por hora aunque lleguen desordenados', () => {
    const desordenados = [event('END', 30), event('START', 0), event('RESUME', 25), event('PAUSE', 10)]
    expect(sessionTiming(desordenados, base + minutes(60)).activeMs).toBe(minutes(15))
  })

  it('ignora un segundo inicio: una aplicación empieza una sola vez', () => {
    const events = [event('START', 0), event('START', 5)]
    const timing = sessionTiming(events, base + minutes(10))

    expect(timing.startedAt).toBe(events[0].at)
    expect(timing.activeMs).toBe(minutes(10))
  })

  it('no reabre el reloj después de finalizar', () => {
    const events = [event('START', 0), event('END', 10), event('RESUME', 20)]
    const timing = sessionTiming(events, base + minutes(90))

    expect(timing.activeMs).toBe(minutes(10))
    expect(timing.running).toBe(false)
    expect(timing.completedAt).toBe(events[1].at)
  })

  it('descarta eventos con hora ilegible en vez de producir NaN', () => {
    const roto: SessionEvent = { id: 'roto', kind: 'PAUSE', at: 'no-es-fecha', professionalId: 'prof-1' }
    const timing = sessionTiming([event('START', 0), roto], base + minutes(5))

    expect(Number.isFinite(timing.activeMs)).toBe(true)
    expect(timing.activeMs).toBe(minutes(5))
  })
})

describe('acciones disponibles del reloj', () => {
  it('sólo ofrece iniciar antes de empezar', () => {
    expect(availableTimerActions(sessionTiming([], base))).toEqual({
      canStart: true,
      canPause: false,
      canResume: false,
      canFinish: false,
    })
  })

  it('ofrece pausar y finalizar mientras corre', () => {
    expect(availableTimerActions(sessionTiming([event('START', 0)], base + minutes(2)))).toMatchObject({
      canStart: false,
      canPause: true,
      canResume: false,
      canFinish: true,
    })
  })

  it('ofrece reanudar tras una pausa', () => {
    const timing = sessionTiming([event('START', 0), event('PAUSE', 5)], base + minutes(9))
    expect(availableTimerActions(timing)).toMatchObject({ canResume: true, canPause: false, canFinish: true })
  })

  it('no ofrece nada sobre una aplicación finalizada', () => {
    const timing = sessionTiming([event('START', 0), event('END', 5)], base + minutes(9))
    expect(availableTimerActions(timing)).toEqual({
      canStart: false,
      canPause: false,
      canResume: false,
      canFinish: false,
    })
  })
})

describe('formato de duración', () => {
  it.each([
    [0, '0 min'],
    [18_000, '18 s'],
    [minutes(24), '24 min'],
    [minutes(102), '1 h 42 min'],
    [minutes(120), '2 h'],
  ])('%s ms → %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected)
  })

  it('formatea el cronómetro con precisión de segundo', () => {
    expect(formatStopwatch(minutes(18) + 42_000)).toBe('00:18:42')
    expect(formatStopwatch(minutes(62) + 4_000)).toBe('01:02:04')
    expect(formatStopwatch(-5)).toBe('00:00:00')
  })
})
