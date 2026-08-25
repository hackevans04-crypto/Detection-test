import { describe, expect, it } from 'vitest'
import { calculateAgeYears, classifyABC, classifyProCalculoPT } from './evaluation-engine'

describe('baremos Test ABC', () => {
  it.each([
    [11, 'RANGO III', 'NIVEL INFERIOR'],
    [12, 'RANGO II', 'NIVEL MEDIO'],
    [16, 'RANGO II', 'NIVEL MEDIO'],
    [17, 'RANGO I', 'NIVEL SUPERIOR'],
    [7, 'RANGO IV', 'NIVEL MAS BAJO'],
  ])('%s puntos', (score, range, level) => {
    expect(classifyABC(score)).toEqual({ range, level })
  })
})

describe('baremos PRO-CALCULO', () => {
  it.each([
    [38, 'BAJO / PRESENTA DIFICULTADES'],
    [39, 'BAJO / PRESENTA DIFICULTADES'],
    [40, 'NORMAL'],
    [60, 'NORMAL'],
    [61, 'ALTO'],
  ])('PT %s', (pt, expected) => {
    expect(classifyProCalculoPT(pt)).toBe(expected)
  })
})

describe('calculo de edad', () => {
  it('calcula edad decimal desde fecha de nacimiento y evaluacion', () => {
    expect(calculateAgeYears('2020-02-01', '2026-08-01')).toBe(6.5)
  })
})
