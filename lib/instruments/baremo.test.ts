import { describe, expect, it } from 'vitest'
import type { Baremo } from '@/instruments/types'
import { baremoLabel, classifyWithBaremos } from '@/lib/instruments/baremo'

const abierto: Baremo[] = [
  { min: 17, rango: 'RANGO I', nivel: 'NIVEL SUPERIOR', descripcion: '17 puntos o más' },
  { min: 12, max: 16, rango: 'RANGO II', nivel: 'NIVEL MEDIO', descripcion: '12 a 16 puntos' },
  { max: 11, rango: 'RANGO III', nivel: 'NIVEL INFERIOR', descripcion: '11 puntos o menos' },
]

describe('clasificación por baremo', () => {
  it('usa los rangos que declara el instrumento, no unos fijos', () => {
    expect(classifyWithBaremos(abierto, 20)?.rango).toBe('RANGO I')
    expect(classifyWithBaremos(abierto, 16)?.rango).toBe('RANGO II')
    expect(classifyWithBaremos(abierto, 3)?.rango).toBe('RANGO III')
  })

  it('no clasifica cuando el instrumento no declara baremo', () => {
    expect(classifyWithBaremos([], 12)).toBeNull()
  })

  it('no clasifica una puntuación que ningún rango cubre', () => {
    const conHueco: Baremo[] = [{ min: 40, max: 60, rango: 'NORMAL', nivel: 'NORMAL', descripcion: 'PT de 40 a 60' }]
    expect(classifyWithBaremos(conHueco, 12)).toBeNull()
  })

  it('no repite el nivel cuando coincide con el rango', () => {
    expect(baremoLabel({ rango: 'NORMAL', nivel: 'NORMAL', descripcion: '' })).toBe('NORMAL')
    expect(baremoLabel({ rango: 'BAJO', nivel: 'PRESENTA DIFICULTADES', descripcion: '' })).toBe(
      'BAJO / PRESENTA DIFICULTADES',
    )
    expect(baremoLabel(null)).toBeNull()
  })
})
