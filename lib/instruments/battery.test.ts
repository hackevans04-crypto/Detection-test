import { describe, expect, it } from 'vitest'
import { sessionLogLabels, type EvaluationInstrument } from '@/lib/evaluations/model'
import {
  addLogEntry,
  addToBattery,
  applicationTimeline,
  batterySummary,
  completeSubtest,
  moveInBattery,
  recordTimerAction,
  removeFromBattery,
  setScore,
  sortedBattery,
  startSubtest,
  updateEntry,
} from '@/lib/instruments/battery'
import { sessionTiming } from '@/lib/instruments/session-timing'

const professional = { professionalId: 'prof-1', professionalName: 'Profesional' }

function build(names: string[]): EvaluationInstrument[] {
  return names.reduce<EvaluationInstrument[]>(
    (battery, name, index) =>
      addToBattery(battery, {
        instrumentId: `inst-${index}`,
        name,
        applicationMode: 'MANUAL',
        ...professional,
      }),
    [],
  )
}

describe('batería de evaluación', () => {
  it('numera las entradas de forma contigua al incorporarlas', () => {
    const battery = build(['A', 'B', 'C'])
    expect(battery.map((entry) => entry.order)).toEqual([1, 2, 3])
    expect(battery.map((entry) => entry.name)).toEqual(['A', 'B', 'C'])
  })

  it('da a cada entrada su propia identidad, no la del instrumento', () => {
    const battery = addToBattery(
      addToBattery([], { instrumentId: 'mismo', name: 'Pre', applicationMode: 'MANUAL', ...professional }),
      { instrumentId: 'mismo', name: 'Post', applicationMode: 'MANUAL', ...professional },
    )

    expect(battery).toHaveLength(2)
    expect(new Set(battery.map((entry) => entry.id)).size).toBe(2)
  })

  it('reordena y vuelve a numerar sin huecos', () => {
    const battery = build(['A', 'B', 'C'])
    const moved = moveInBattery(battery, battery[2].id, 'up')

    expect(sortedBattery(moved).map((entry) => entry.name)).toEqual(['A', 'C', 'B'])
    expect(sortedBattery(moved).map((entry) => entry.order)).toEqual([1, 2, 3])
  })

  it('no mueve fuera de los extremos', () => {
    const battery = build(['A', 'B'])
    expect(moveInBattery(battery, battery[0].id, 'up')).toBe(battery)
    expect(moveInBattery(battery, battery[1].id, 'down')).toBe(battery)
  })

  it('renumera al quitar una entrada', () => {
    const battery = build(['A', 'B', 'C'])
    const left = removeFromBattery(battery, battery[0].id)

    expect(left.map((entry) => entry.name)).toEqual(['B', 'C'])
    expect(left.map((entry) => entry.order)).toEqual([1, 2])
  })
})

describe('reloj de una entrada', () => {
  it('registra los eventos en vez de guardar una duración', () => {
    const [entry] = build(['A'])
    const started = recordTimerAction(entry, 'start', 'prof-1')

    expect(started.events).toHaveLength(1)
    expect(started.events[0].kind).toBe('START')
    expect(started.status).toBe('IN_PROGRESS')
    expect(Object.keys(started)).not.toContain('activeDuration')
  })

  it('finalizar deja la entrada completada', () => {
    const [entry] = build(['A'])
    const done = recordTimerAction(recordTimerAction(entry, 'start', 'prof-1'), 'finish', 'prof-1')

    expect(done.status).toBe('COMPLETED')
    expect(sessionTiming(done.events).completedAt).not.toBeNull()
  })
})

describe('registro de aplicación', () => {
  it('ordena eventos de reloj y observaciones en una sola secuencia', () => {
    const [entry] = build(['A'])
    const withLog = addLogEntry(recordTimerAction(entry, 'start', 'prof-1'), {
      kind: 'INTERRUPTION',
      note: 'Entra otra persona al aula.',
      professionalId: 'prof-1',
    })

    const timeline = applicationTimeline(withLog, sessionLogLabels)
    expect(timeline).toHaveLength(2)
    expect(timeline[0].label).toBe('Inicio de aplicación')
    expect(timeline[1]).toMatchObject({ label: 'Interrupción', detail: 'Entra otra persona al aula.' })
  })

  it('asocia la observación al subtest en curso', () => {
    const battery = addToBattery([], {
      instrumentId: 'inst',
      name: 'A',
      applicationMode: 'MANUAL',
      subtests: [{ id: 's1', label: 'Uno' }],
      ...professional,
    })

    const running = startSubtest(battery[0], 's1')
    const logged = addLogEntry(running, { kind: 'OBSERVATION', note: 'Duda.', subtestId: 's1', professionalId: 'p' })

    expect(logged.log[0].subtestId).toBe('s1')
  })
})

describe('subtests', () => {
  const withSubtests = () =>
    addToBattery([], {
      instrumentId: 'inst',
      name: 'A',
      applicationMode: 'MANUAL',
      subtests: [
        { id: 's1', label: 'Uno' },
        { id: 's2', label: 'Dos' },
      ],
      ...professional,
    })[0]

  it('marca inicio y fin de cada subtest', () => {
    const done = completeSubtest(startSubtest(withSubtests(), 's1'), 's1')
    const run = done.subtestRuns.find((item) => item.subtestId === 's1')!

    expect(run.status).toBe('COMPLETED')
    expect(run.startedAt).not.toBeNull()
    expect(run.completedAt).not.toBeNull()
  })

  it('no reinicia un subtest ya recorrido', () => {
    const done = completeSubtest(startSubtest(withSubtests(), 's1'), 's1')
    const again = startSubtest(done, 's1')

    expect(again.subtestRuns.find((item) => item.subtestId === 's1')!.status).toBe('COMPLETED')
  })
})

describe('resumen de la batería', () => {
  it('cuenta cero sobre una batería vacía', () => {
    expect(batterySummary([])).toMatchObject({
      planned: 0,
      completed: 0,
      inProgress: 0,
      pending: 0,
      totalDurationMs: 0,
      withResults: 0,
    })
  })

  it('reparte los instrumentos por su estado real de reloj', () => {
    let battery = build(['A', 'B', 'C'])
    battery = updateEntry(battery, battery[0].id, (entry) =>
      recordTimerAction(recordTimerAction(entry, 'start', 'p'), 'finish', 'p'),
    )
    battery = updateEntry(battery, battery[1].id, (entry) => recordTimerAction(entry, 'start', 'p'))

    expect(batterySummary(battery)).toMatchObject({ planned: 3, completed: 1, inProgress: 1, pending: 1 })
  })

  it('sólo cuenta con resultados los instrumentos con alguna medida escrita', () => {
    let battery = build(['A', 'B'])
    battery = updateEntry(battery, battery[0].id, (entry) => setScore(entry, 'm1', '12'))
    battery = updateEntry(battery, battery[1].id, (entry) => setScore(entry, 'm1', '   '))

    expect(batterySummary(battery).withResults).toBe(1)
  })

  it('cuenta como pendiente de revisión el finalizado sin informe aprobado', () => {
    let battery = build(['A'])
    battery = updateEntry(battery, battery[0].id, (entry) =>
      recordTimerAction(recordTimerAction(entry, 'start', 'p'), 'finish', 'p'),
    )

    expect(batterySummary(battery).awaitingReview).toBe(1)
  })
})
