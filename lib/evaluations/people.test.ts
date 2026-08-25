import { describe, expect, it } from 'vitest'
import { knownPeople, matchesPerson } from '@/lib/evaluations/people'
import { makeEvaluation } from '@/lib/evaluations/test-factory'
import type { Evaluation } from '@/lib/evaluations/model'

function withPerson(
  overrides: { id: string; fullName: string; identification?: string; updatedAt?: string; grade?: string },
): Evaluation {
  const base = makeEvaluation()
  return makeEvaluation({
    id: overrides.id,
    code: `EV-2026-${overrides.id}`,
    updatedAt: overrides.updatedAt ?? base.updatedAt,
    initialData: {
      ...base.initialData,
      person: {
        ...base.initialData.person,
        fullName: overrides.fullName,
        identification: overrides.identification ?? '',
        grade: overrides.grade ?? base.initialData.person.grade,
      },
    },
  })
}

describe('personas ya evaluadas', () => {
  it('deriva una persona por expediente cuando no se repiten', () => {
    const people = knownPeople([
      withPerson({ id: '1', fullName: 'Torres Aa Fanny' }),
      withPerson({ id: '2', fullName: 'Pérez Bb Mateo' }),
    ])

    expect(people).toHaveLength(2)
    expect(people.map((entry) => entry.person.fullName)).toContain('Torres Aa Fanny')
  })

  it('agrupa por cédula aunque el nombre esté escrito distinto', () => {
    const people = knownPeople([
      withPerson({ id: '1', fullName: 'Torres Aa Fanny', identification: '1500578300' }),
      withPerson({ id: '2', fullName: 'TORRES AA, Fanny', identification: '1500578300' }),
    ])

    expect(people).toHaveLength(1)
    expect(people[0].evaluationCount).toBe(2)
  })

  it('agrupa por nombre cuando no hay cédula, ignorando tildes y mayúsculas', () => {
    const people = knownPeople([
      withPerson({ id: '1', fullName: 'Pérez Bb Mateo' }),
      withPerson({ id: '2', fullName: 'perez bb  MATEO' }),
    ])

    expect(people).toHaveLength(1)
  })

  it('conserva la ficha del expediente más reciente', () => {
    const people = knownPeople([
      withPerson({ id: '1', fullName: 'Torres Aa', identification: '1', grade: '1ro EGB', updatedAt: '2026-01-01T00:00:00.000Z' }),
      withPerson({ id: '2', fullName: 'Torres Aa', identification: '1', grade: '2do EGB', updatedAt: '2026-08-01T00:00:00.000Z' }),
    ])

    expect(people[0].person.grade).toBe('2do EGB')
  })

  it('descarta expedientes sin nombre: no son una persona todavía', () => {
    expect(knownPeople([withPerson({ id: '1', fullName: '   ' })])).toHaveLength(0)
  })

  it('busca por nombre, cédula, curso y código', () => {
    const [entry] = knownPeople([
      withPerson({ id: '1', fullName: 'Torres Aa Fanny', identification: '1500578300', grade: '2do EGB' }),
    ])

    expect(matchesPerson(entry, 'torres')).toBe(true)
    expect(matchesPerson(entry, 'TÓRRES')).toBe(true)
    expect(matchesPerson(entry, '15005')).toBe(true)
    expect(matchesPerson(entry, '2do')).toBe(true)
    expect(matchesPerson(entry, '')).toBe(true)
    expect(matchesPerson(entry, 'zzz')).toBe(false)
  })
})
