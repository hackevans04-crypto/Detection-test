import { instruments } from '@/instruments/catalog'
import type { Instrument, Subtest } from '@/instruments/types'

export type EvaluationArea = {
  id: string
  name: string
  /** Instrumentos del catálogo que declaran esta área. */
  instrumentIds: string[]
  /** Subtests reales que la exploran. Sustituye a una descripción inventada. */
  subtests: Array<{ instrumentId: string; instrumentName: string; subtest: Subtest }>
}

export type AreaGroup = {
  instrument: Instrument
  areas: EvaluationArea[]
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Las áreas de evaluación no son un catálogo aparte: son exactamente las que
 * los instrumentos declaran en `instrument.areas`. Derivarlas evita ofrecer al
 * profesional un área que ningún instrumento configurado puede explorar.
 */
export const evaluationAreas: EvaluationArea[] = (() => {
  const byId = new Map<string, EvaluationArea>()

  for (const instrument of instruments) {
    for (const name of instrument.areas) {
      const id = slugify(name)
      const existing = byId.get(id)
      const area = existing ?? { id, name, instrumentIds: [], subtests: [] }
      if (!area.instrumentIds.includes(instrument.id)) area.instrumentIds.push(instrument.id)
      for (const subtest of instrument.subtests) {
        if (subtest.area !== name) continue
        area.subtests.push({ instrumentId: instrument.id, instrumentName: instrument.nombre, subtest })
      }
      byId.set(id, area)
    }
  }

  return [...byId.values()]
})()

/** Agrupadas por instrumento, que es como el profesional las reconoce. */
export const areaGroups: AreaGroup[] = instruments.map((instrument) => ({
  instrument,
  areas: evaluationAreas.filter((area) => area.instrumentIds.includes(instrument.id)),
}))

export function getArea(id: string) {
  return evaluationAreas.find((area) => area.id === id) ?? null
}

export function areaNames(ids: string[]) {
  return ids.map((id) => getArea(id)?.name).filter((name): name is string => Boolean(name))
}

/**
 * Un instrumento es aplicable cuando explora al menos una de las áreas
 * seleccionadas en el paso 3.
 */
export function compatibleInstruments(selectedAreaIds: string[]) {
  if (selectedAreaIds.length === 0) return []
  const selected = new Set(selectedAreaIds)
  return instruments.filter((instrument) => instrument.areas.some((name) => selected.has(slugify(name))))
}

export { slugify as areaSlug }
