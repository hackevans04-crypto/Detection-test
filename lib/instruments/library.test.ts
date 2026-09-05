import { describe, expect, it } from 'vitest'
import {
  getInstrument,
  instruments,
  isArchivedInstrument,
  libraryInstruments,
  recommendableInstruments,
} from '@/instruments/catalog'
import { archivedInstruments } from '@/instruments/legacy-archive'
import { completeBackground, makeEvaluation } from '@/lib/evaluations/test-factory'
import { evaluateInformationCompleteness } from '@/lib/evaluations/context-service'
import { recommendInstruments } from '@/lib/instruments/recommendation-engine'

const archivedIds = archivedInstruments.map((instrument) => instrument.id)

describe('catálogo de instrumentos', () => {
  it('no trae instrumentos precargados', () => {
    expect(instruments).toEqual([])
    expect(libraryInstruments()).toEqual([])
    expect(recommendableInstruments()).toEqual([])
  })

  it('mantiene el archivo histórico fuera de biblioteca y recomendaciones', () => {
    expect(archivedIds.length).toBeGreaterThan(0)
    for (const instrument of archivedInstruments) {
      expect(instrument.lifecycle).toBe('ARCHIVED')
      expect(instrument.legacy).toBe(true)
      expect(instrument.excludeFromLibrary).toBe(true)
      expect(instrument.excludeFromRecommendations).toBe(true)
      expect(libraryInstruments()).not.toContainEqual(instrument)
      expect(recommendableInstruments()).not.toContainEqual(instrument)
    }
  })

  it('sigue resolviendo un instrumento archivado para leer expedientes anteriores', () => {
    for (const id of archivedIds) {
      expect(getInstrument(id)?.id).toBe(id)
      expect(isArchivedInstrument(id)).toBe(true)
    }
  })

  it('no resuelve un instrumento que no existe', () => {
    expect(getInstrument('instrumento-inexistente')).toBeNull()
    expect(isArchivedInstrument('instrumento-inexistente')).toBe(false)
  })
})

describe('motor de recomendación', () => {
  it('no recomienda nada mientras no exista un instrumento validado', () => {
    expect(recommendInstruments(makeEvaluation())).toEqual([])
  })

  it('no recurre al archivo histórico como respaldo', () => {
    const evaluation = makeEvaluation({
      background: completeBackground(),
      initialData: { ...makeEvaluation().initialData, person: { ...makeEvaluation().initialData.person, birthDate: '2020-02-01' } },
    })

    const recommended = recommendInstruments(evaluation).map((item) => item.instrument.id)
    for (const id of archivedIds) expect(recommended).not.toContain(id)
  })
})

describe('suficiencia de información', () => {
  it('exige edad y motivo para considerar el expediente utilizable', () => {
    const sinMotivo = makeEvaluation({
      referral: { reason: '', source: '', officeNumber: '', officeDate: '', documentNumber: '', requestText: '' },
    })

    const result = evaluateInformationCompleteness(sinMotivo)
    expect(result.level).toBe('INSUFFICIENT')
    expect(result.label).toBe('Información insuficiente')
    expect(result.missing.some((item) => item.step === 'motivo' && item.required)).toBe(true)
  })

  it('marca insuficiente cuando no se puede calcular la edad cronológica', () => {
    const base = makeEvaluation()
    const sinFecha = makeEvaluation({
      initialData: { ...base.initialData, person: { ...base.initialData.person, birthDate: '' } },
    })

    expect(evaluateInformationCompleteness(sinFecha).level).toBe('INSUFFICIENT')
  })

  it('es parcial, no insuficiente, cuando sólo falta información complementaria', () => {
    const result = evaluateInformationCompleteness(makeEvaluation())

    expect(result.level).toBe('PARTIAL')
    expect(result.label).toBe('Información parcial')
    expect(result.missing.every((item) => !item.required)).toBe(true)
  })

  it('no declara suficiente un expediente al que le falta algo', () => {
    const partial = evaluateInformationCompleteness(makeEvaluation())
    expect(partial.missing.length).toBeGreaterThan(0)
    expect(partial.level).not.toBe('SUFFICIENT')
  })
})
