import { archivedInstruments } from '@/instruments/legacy-archive'
import type { Instrument } from '@/instruments/types'

export type { Baremo, Instrument, InstrumentLifecycle, ScoringMode, Subtest } from '@/instruments/types'

/**
 * Catálogo activo de instrumentos.
 *
 * Vacío a propósito. El producto no trae instrumentos precargados: un
 * instrumento entra al catálogo cuando se incorpora en el paso 6, la IA lo
 * estructura y un profesional valida sus reglas. Hasta entonces la biblioteca
 * está legítimamente vacía, y eso es lo que ve el profesional.
 *
 * No añadir definiciones aquí a mano. Lo que no está validado no se recomienda,
 * y un instrumento inventado es peor que ninguno.
 */
export const instruments: Instrument[] = []

/** Lo que la biblioteca y la búsqueda pueden mostrar. */
export function libraryInstruments(): Instrument[] {
  return instruments.filter((instrument) => !instrument.excludeFromLibrary)
}

/** Lo que el motor de recomendación puede considerar como candidato. */
export function recommendableInstruments(): Instrument[] {
  return instruments.filter(
    (instrument) => instrument.lifecycle === 'PUBLISHED' && !instrument.excludeFromRecommendations,
  )
}

/**
 * Resuelve un instrumento por id, incluido el archivo histórico.
 *
 * La búsqueda en el archivo existe para que un expediente antiguo siga
 * abriéndose: sus resultados, su informe y su evidencia necesitan la estructura
 * del instrumento que se aplicó. Nada de lo que llega por esta vía puede
 * ofrecerse como instrumento disponible; para eso están las dos funciones de
 * arriba.
 */
export function getInstrument(id: string): Instrument | null {
  return (
    instruments.find((instrument) => instrument.id === id) ??
    archivedInstruments.find((instrument) => instrument.id === id) ??
    null
  )
}

/** `true` cuando el id sólo se resuelve desde el archivo histórico. */
export function isArchivedInstrument(id: string) {
  return (
    !instruments.some((instrument) => instrument.id === id) &&
    archivedInstruments.some((instrument) => instrument.id === id)
  )
}

export function getSubtest(instrumentId: string, subtestId: string) {
  return getInstrument(instrumentId)?.subtests.find((subtest) => subtest.id === subtestId) ?? null
}
