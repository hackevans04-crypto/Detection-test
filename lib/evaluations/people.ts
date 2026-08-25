import { ageAt, formatAge } from '@/lib/evaluations/format'
import type { EvaluatedPerson, Evaluation } from '@/lib/evaluations/model'

/**
 * Personas ya evaluadas, deducidas de los expedientes existentes.
 *
 * No hay un registro de estudiantes aparte: la única fuente de personas es lo
 * que se ha registrado evaluando. Por eso esta lista se deriva y nunca se
 * inventa —si sólo hay un expediente, sólo aparece una persona—.
 */

export type KnownPerson = {
  /** Identidad estable: la cédula si existe, y si no el nombre normalizado. */
  key: string
  person: EvaluatedPerson
  ageLabel: string
  evaluationCount: number
  lastEvaluationAt: string
  lastEvaluationCode: string
}

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function keyOf(person: EvaluatedPerson) {
  const identification = person.identification.trim()
  return identification ? `id:${identification}` : `name:${normalize(person.fullName)}`
}

export function knownPeople(evaluations: Evaluation[]): KnownPerson[] {
  const byKey = new Map<string, KnownPerson>()

  // Se recorre de más reciente a más antiguo, así la ficha que se conserva es
  // la última que el profesional corrigió.
  const ordered = [...evaluations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  for (const evaluation of ordered) {
    const person = evaluation.initialData.person
    if (!person.fullName.trim()) continue

    const key = keyOf(person)
    const existing = byKey.get(key)
    if (existing) {
      existing.evaluationCount += 1
      continue
    }

    const age = ageAt(person.birthDate, evaluation.initialData.evaluationDate)
    byKey.set(key, {
      key,
      person,
      ageLabel: age ? formatAge(age) : 'Edad no registrada',
      evaluationCount: 1,
      lastEvaluationAt: evaluation.updatedAt,
      lastEvaluationCode: evaluation.code,
    })
  }

  return [...byKey.values()]
}

export function matchesPerson(entry: KnownPerson, query: string) {
  const normalized = normalize(query)
  if (!normalized) return true
  return [entry.person.fullName, entry.person.identification, entry.lastEvaluationCode, entry.person.grade]
    .map(normalize)
    .some((value) => value.includes(normalized))
}
