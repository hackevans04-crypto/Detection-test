import type { Evaluation, FunctionalAreaId, FunctionalAreaRecord, Performance } from '@/lib/evaluations/model'
import { functionalAreaIds } from '@/lib/evaluations/model'

/**
 * Observación psicopedagógica funcional.
 *
 * Es una etapa distinta de la aplicación de instrumentos: aquí el profesional
 * observa y describe: conocimiento corporal, lateralidad, orientación,
 * motricidad y lenguaje. Ocurre antes de los instrumentos porque es lo que
 * justifica cuáles aplicar.
 */

export type AreaField = {
  id: string
  label: string
  options: readonly string[]
}

export type FunctionalAreaSchema = {
  id: FunctionalAreaId
  label: string
  /** Qué se observa, en las palabras del informe. */
  purpose: string
  descriptionLabel: string
  descriptionPlaceholder: string
  fields: AreaField[]
}

const dominance = ['Diestra', 'Zurda', 'Ambidiestra', 'Sin definir'] as const
const orientation = ['Dentro de lo esperado', 'En desarrollo', 'Alterada', 'Sin información'] as const

export const performanceOptions: readonly Exclude<Performance, ''>[] = [
  'Adecuado',
  'En desarrollo',
  'Dificultad marcada',
]

export const functionalAreaSchema: FunctionalAreaSchema[] = [
  {
    id: 'conocimiento-corporal',
    label: 'Conocimiento corporal',
    purpose: 'Reconoce las partes principales del cuerpo y su ubicación en sí mismo y en el otro.',
    descriptionLabel: 'Descripción',
    descriptionPlaceholder: 'Qué reconoce, qué confunde y con qué apoyo lo resuelve…',
    fields: [],
  },
  {
    id: 'dominancia-lateral',
    label: 'Dominancia lateral',
    purpose: 'Establece la lateralidad por segmento y su consistencia.',
    descriptionLabel: 'Descripción',
    descriptionPlaceholder: 'Consistencia entre segmentos, cruces observados…',
    fields: [
      { id: 'ojo', label: 'Ojo', options: dominance },
      { id: 'oido', label: 'Oído', options: dominance },
      { id: 'mano', label: 'Mano', options: dominance },
      { id: 'pie', label: 'Pie', options: dominance },
    ],
  },
  {
    id: 'orientacion',
    label: 'Orientación',
    purpose: 'Orientación alopsíquica (espacio y tiempo) y autopsíquica (sí mismo).',
    descriptionLabel: 'Descripción',
    descriptionPlaceholder: 'Ubicación en el espacio, nociones temporales, datos personales…',
    fields: [
      { id: 'alopsiquica', label: 'Orientación alopsíquica', options: orientation },
      { id: 'autopsiquica', label: 'Orientación autopsíquica', options: orientation },
    ],
  },
  {
    id: 'motricidad-gruesa',
    label: 'Motricidad gruesa',
    purpose: 'Coordinación general, equilibrio y control postural.',
    descriptionLabel: 'Descripción',
    descriptionPlaceholder: 'Marcha, salto, equilibrio, coordinación de grandes grupos musculares…',
    fields: [],
  },
  {
    id: 'motricidad-fina',
    label: 'Motricidad fina',
    purpose: 'Precisión manual, prensión y coordinación visomotora.',
    descriptionLabel: 'Descripción',
    descriptionPlaceholder: 'Prensión del lápiz, trazo, recorte, coordinación ojo-mano…',
    fields: [],
  },
  {
    id: 'habilidades-psicolinguisticas',
    label: 'Habilidades psicolingüísticas',
    purpose: 'Nivel comprensivo, articulatorio y expresivo del lenguaje.',
    descriptionLabel: 'Descripción',
    descriptionPlaceholder: 'Comprensión de consignas, articulación, vocabulario y expresión…',
    fields: [
      { id: 'comprensivo', label: 'Comprensivo', options: orientation },
      { id: 'articulatorio', label: 'Articulatorio', options: orientation },
      { id: 'expresivo', label: 'Expresivo', options: orientation },
    ],
  },
]

export function areaSchemaById(id: FunctionalAreaId) {
  return functionalAreaSchema.find((area) => area.id === id) ?? functionalAreaSchema[0]
}

/**
 * Un área cuenta como observada cuando tiene desempeño valorado y descripción.
 * Los desplegables propios del área también son obligatorios: una lateralidad
 * a medias no describe nada.
 */
export function isAreaComplete(record: FunctionalAreaRecord, schema: FunctionalAreaSchema) {
  if (record.performance === '') return false
  if (record.description.trim().length === 0) return false
  return schema.fields.every((field) => (record.fields[field.id] ?? '').trim().length > 0)
}

export function completedAreas(evaluation: Evaluation) {
  return functionalAreaSchema.filter((schema) => isAreaComplete(evaluation.functionalAreas[schema.id], schema))
}

/** Áreas con dificultad, para el resumen de evidencia de conclusiones. */
export function areasWithDifficulty(evaluation: Evaluation) {
  return functionalAreaSchema.filter(
    (schema) => evaluation.functionalAreas[schema.id]?.performance === 'Dificultad marcada',
  )
}

export function areasInProgress(evaluation: Evaluation) {
  return functionalAreaSchema.filter(
    (schema) => evaluation.functionalAreas[schema.id]?.performance === 'En desarrollo',
  )
}

export { functionalAreaIds }
