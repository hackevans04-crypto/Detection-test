import type { BackgroundSectionId } from '@/lib/evaluations/model'

/**
 * Estructura de «Contexto y antecedentes», calcada del informe.
 *
 * Siete secciones, no un formulario único ni siete módulos del menú: todo vive
 * dentro de la misma etapa del expediente. Las intervenciones anteriores no
 * están aquí porque son una lista repetible, no campos fijos.
 */

export type BackgroundField = {
  id: string
  label: string
  placeholder: string
  /** Campo de opción cerrada cuando el informe usa una categoría. */
  options?: readonly string[]
  /** Los campos de observación no bloquean el ✓ de la sección. */
  optional?: boolean
  rows?: number
}

export type BackgroundBlock = {
  id: string
  title: string
  hint: string
  fields: BackgroundField[]
}

export type BackgroundSection = {
  id: BackgroundSectionId
  label: string
  description: string
  blocks: BackgroundBlock[]
}

const siNo = ['Sí', 'No', 'Sin información'] as const

export const backgroundSchema: BackgroundSection[] = [
  {
    id: 'desarrollo',
    label: 'Desarrollo',
    description: 'Historia del desarrollo desde el embarazo hasta los hitos alcanzados.',
    blocks: [
      {
        id: 'prenatal',
        title: 'Prenatal',
        hint: 'Embarazo, controles y complicaciones registradas.',
        fields: [
          { id: 'embarazo', label: 'Embarazo', placeholder: 'Selecciona', options: ['Planificado', 'No planificado', 'Sin información'] },
          { id: 'edadMaterna', label: 'Edad materna al embarazo', placeholder: 'Ej. 26 años' },
          { id: 'complicaciones', label: 'Complicaciones durante el embarazo', placeholder: 'Preeclampsia, controles médicos, tratamientos…', rows: 3 },
          { id: 'observaciones', label: 'Observaciones adicionales', placeholder: 'Notas del profesional sobre la etapa prenatal…', optional: true, rows: 2 },
        ],
      },
      {
        id: 'perinatal',
        title: 'Perinatal',
        hint: 'Nacimiento y condiciones del parto.',
        fields: [
          { id: 'tipoParto', label: 'Tipo de parto', placeholder: 'Selecciona', options: ['Vaginal', 'Cesárea', 'Sin información'] },
          { id: 'semanas', label: 'Semanas de gestación', placeholder: 'Ej. 37 semanas' },
          { id: 'peso', label: 'Peso y talla al nacer', placeholder: 'Ej. 3.100 g · 49 cm' },
          { id: 'complicaciones', label: 'Complicaciones al nacer', placeholder: 'Reanimación, incubadora, ictericia…', rows: 3 },
          { id: 'observaciones', label: 'Observaciones adicionales', placeholder: 'Notas del profesional sobre la etapa perinatal…', optional: true, rows: 2 },
        ],
      },
      {
        id: 'posnatal',
        title: 'Posnatal',
        hint: 'Hitos del desarrollo y evolución en los primeros años.',
        fields: [
          { id: 'hitos', label: 'Hitos del desarrollo', placeholder: 'Edad de sedestación, gateo, marcha, control de esfínteres…', rows: 3 },
          { id: 'lenguaje', label: 'Lenguaje', placeholder: 'Primeras palabras, frases, inteligibilidad del habla…', rows: 2 },
          { id: 'motricidad', label: 'Motricidad', placeholder: 'Motricidad gruesa y fina, coordinación, lateralidad…', rows: 2 },
          { id: 'observaciones', label: 'Observaciones adicionales', placeholder: 'Notas del profesional sobre la etapa posnatal…', optional: true, rows: 2 },
        ],
      },
    ],
  },
  {
    id: 'salud',
    label: 'Salud',
    description: 'Antecedentes médicos, salud actual y exámenes complementarios.',
    blocks: [
      {
        id: 'antecedentes',
        title: 'Antecedentes de salud',
        hint: 'Historia clínica relevante para el proceso.',
        fields: [
          { id: 'antecedentes', label: 'Antecedentes médicos relevantes', placeholder: 'Enfermedades, hospitalizaciones, cirugías, alergias…', rows: 3 },
          { id: 'medicacion', label: 'Medicación', placeholder: 'Medicamentos actuales, dosis y efectos observados…', rows: 2 },
        ],
      },
      {
        id: 'actual',
        title: 'Salud actual',
        hint: 'Estado en el momento de la evaluación.',
        fields: [
          { id: 'estado', label: 'Estado de salud actual', placeholder: 'Condición general en el momento de la evaluación…', rows: 3 },
          { id: 'vision', label: 'Visión', placeholder: 'Última valoración, uso de lentes, dificultades observadas…', rows: 2 },
          { id: 'audicion', label: 'Audición', placeholder: 'Última valoración, dificultades observadas…', rows: 2 },
        ],
      },
      {
        id: 'examenes',
        title: 'Exámenes complementarios',
        hint: 'Estudios realizados y diagnósticos previos con su fuente.',
        fields: [
          { id: 'examenes', label: 'Exámenes realizados', placeholder: 'Tipo de examen, fecha, institución y resultado…', rows: 3 },
          { id: 'diagnostico', label: 'Diagnóstico previo', placeholder: 'Diagnósticos emitidos por otros profesionales, con fecha y fuente…', rows: 2 },
        ],
      },
    ],
  },
  {
    id: 'autonomia',
    label: 'Autonomía',
    description: 'Nivel de autonomía personal en las actividades cotidianas.',
    blocks: [
      {
        id: 'personal',
        title: 'Autonomía personal',
        hint: 'Qué resuelve solo y en qué necesita apoyo.',
        fields: [
          { id: 'alimentacion', label: 'Alimentación', placeholder: 'Selecciona', options: ['Autónoma', 'Con apoyo parcial', 'Requiere apoyo total', 'Sin información'] },
          { id: 'vestido', label: 'Vestido', placeholder: 'Selecciona', options: ['Autónomo', 'Con apoyo parcial', 'Requiere apoyo total', 'Sin información'] },
          { id: 'higiene', label: 'Higiene', placeholder: 'Selecciona', options: ['Autónoma', 'Con apoyo parcial', 'Requiere apoyo total', 'Sin información'] },
          { id: 'desplazamiento', label: 'Desplazamiento', placeholder: 'Selecciona', options: ['Autónomo', 'Con apoyo parcial', 'Requiere apoyo total', 'Sin información'] },
          { id: 'observaciones', label: 'Observaciones', placeholder: 'Descripción cualitativa de la autonomía del estudiante…', optional: true, rows: 3 },
        ],
      },
    ],
  },
  {
    id: 'familia',
    label: 'Familia',
    description: 'Estructura, dinámica y condiciones del entorno familiar.',
    blocks: [
      {
        id: 'estructura',
        title: 'Estructura familiar',
        hint: 'Con quién vive y qué rol cumple cada persona.',
        fields: [
          { id: 'estructura', label: 'Composición del hogar', placeholder: 'Personas que conviven, edades y parentesco…', rows: 3 },
          { id: 'antecedentes', label: 'Antecedentes familiares relevantes', placeholder: 'Dificultades de aprendizaje, lenguaje u otras en la familia…', rows: 2 },
        ],
      },
      {
        id: 'dinamica',
        title: 'Dinámica familiar',
        hint: 'Vínculos, normas y acompañamiento.',
        fields: [
          { id: 'dinamica', label: 'Dinámica familiar', placeholder: 'Relaciones, normas del hogar, acompañamiento en tareas…', rows: 3 },
        ],
      },
      {
        id: 'condiciones',
        title: 'Situación económica y vivienda',
        hint: 'Condiciones materiales que inciden en el aprendizaje.',
        fields: [
          { id: 'economica', label: 'Situación económica', placeholder: 'Ocupación de los adultos, ingresos, recursos disponibles…', rows: 2 },
          { id: 'vivienda', label: 'Vivienda', placeholder: 'Tipo de vivienda, servicios, espacio de estudio…', rows: 2 },
          { id: 'observaciones', label: 'Observaciones', placeholder: 'Notas del profesional sobre el contexto familiar…', optional: true, rows: 2 },
        ],
      },
    ],
  },
  {
    id: 'historia-escolar',
    label: 'Historia escolar',
    description: 'Trayectoria educativa previa del estudiante.',
    blocks: [
      {
        id: 'trayectoria',
        title: 'Trayectoria',
        hint: 'Escolarización desde el inicio hasta hoy.',
        fields: [
          { id: 'inicio', label: 'Inicio de la escolarización', placeholder: 'Edad de ingreso, nivel inicial cursado…', rows: 2 },
          { id: 'trayectoria', label: 'Instituciones y cursos realizados', placeholder: 'Centros, años, cambios de institución y motivos…', rows: 3 },
          { id: 'repeticiones', label: 'Repeticiones o interrupciones', placeholder: 'Cursos repetidos, ausencias prolongadas…', rows: 2 },
        ],
      },
    ],
  },
  {
    id: 'contexto-educativo',
    label: 'Contexto educativo',
    description: 'Situación en el aula en el momento de la evaluación.',
    blocks: [
      {
        id: 'aula',
        title: 'Situación actual en el aula',
        hint: 'Lo que se observa hoy en el centro.',
        fields: [
          { id: 'rendimiento', label: 'Rendimiento académico', placeholder: 'Desempeño por áreas, calificaciones, evolución…', rows: 3 },
          { id: 'dificultades', label: 'Dificultades observadas', placeholder: 'Lectura, escritura, cálculo, atención, seguimiento de consignas…', rows: 3 },
          { id: 'adaptacion', label: 'Adaptación escolar', placeholder: 'Vínculo con pares y docentes, asistencia, participación…', rows: 3 },
        ],
      },
      {
        id: 'apoyos',
        title: 'Apoyos en el centro',
        hint: 'Qué medidas están activas actualmente.',
        fields: [
          { id: 'adaptaciones', label: 'Adaptaciones curriculares vigentes', placeholder: 'Selecciona', options: [...siNo] },
          { id: 'detalleAdaptaciones', label: 'Detalle de los apoyos', placeholder: 'Tipo de adaptación, responsable y desde cuándo…', rows: 2 },
          { id: 'observacionesDocentes', label: 'Observaciones docentes', placeholder: 'Aportes del docente tutor…', optional: true, rows: 3 },
        ],
      },
    ],
  },
]

export function backgroundSectionById(id: BackgroundSectionId) {
  return backgroundSchema.find((section) => section.id === id) ?? backgroundSchema[0]
}

/** Las claves llevan prefijo de bloque para que dos «observaciones» no choquen. */
export function fieldKey(blockId: string, fieldId: string) {
  return `${blockId}.${fieldId}`
}

/**
 * Un bloque formado sólo por observaciones nunca impide el ✓: es una invitación
 * a añadir contexto, no un requisito del expediente.
 */
export function isBlockComplete(values: Record<string, string>, block: BackgroundBlock) {
  return block.fields
    .filter((field) => !field.optional)
    .every((field) => (values[fieldKey(block.id, field.id)] ?? '').trim().length > 0)
}

export function isSectionComplete(values: Record<string, string>, section: BackgroundSection) {
  return section.blocks.every((block) => isBlockComplete(values, block))
}
