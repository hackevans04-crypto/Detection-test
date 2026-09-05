/**
 * Tipos del catálogo de instrumentos.
 *
 * El catálogo es la única fuente de contenido psicopedagógico del producto:
 * nombres, áreas, subtests, baremos y rangos de edad salen de aquí y de
 * ningún otro sitio. Lo que la documentación no respalda se declara ausente
 * (`normativeStatus`) en lugar de rellenarse.
 */

/**
 * Cómo se registra la ejecución de un subtest.
 * - `manual_score`: el evaluador anota una puntuación discreta observada.
 * - `pd_pt`: puntuación directa y, si existe tabla normativa, puntuación típica.
 */
export type ScoringMode = 'manual_score' | 'pd_pt'

/**
 * Estado del instrumento dentro de la biblioteca.
 * - `PUBLISHED`: validado; puede recomendarse y aplicarse en una evaluación nueva.
 * - `ARCHIVED`: sólo se resuelve para leer expedientes que ya lo aplicaron. Nunca
 *   aparece en biblioteca, recomendaciones ni resultados de búsqueda.
 */
export type InstrumentLifecycle = 'PUBLISHED' | 'ARCHIVED'

export type Baremo = {
  min?: number
  max?: number
  rango: string
  nivel: string
  descripcion: string
}

export type Subtest = {
  id: string
  numero: number
  nombre: string
  area: string
  instrucciones: string
  puntajeMaximo: number
  criterioCorreccion: string
  tiempoEstimado: string
  /** Etiquetas de la escala en subtests de puntuación manual. */
  escala?: string[]
}

export type Instrument = {
  id: string
  version: string
  nombre: string
  subtitulo: string
  autor: string
  objetivo: string
  edadMin: number
  edadMax: number
  rangoTexto: string
  tiempo: string
  aplicacion: string
  descripcion: string
  instrucciones: string
  scoringMode: ScoringMode
  /** Cómo se llama una unidad del instrumento en su propia documentación. */
  unidad: { singular: string; plural: string }
  areas: string[]
  subtests: Subtest[]
  baremos: Baremo[]
  reglasInterpretacion: string[]
  /** Qué falta por cargar. Se muestra al evaluador, no se disimula. */
  normativeStatus: string
  /** `true` cuando existen tablas para convertir PD en PT. */
  hasNormativeTables: boolean
  lifecycle: InstrumentLifecycle
  /** Procede de la implementación manual anterior al motor de incorporación. */
  legacy: boolean
  /** Nunca se lista en la biblioteca ni en la búsqueda del profesional. */
  excludeFromLibrary: boolean
  /** Nunca entra en el motor de recomendación, en ningún estado. */
  excludeFromRecommendations: boolean
}
