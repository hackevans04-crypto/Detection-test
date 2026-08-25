import type { Instrument } from '@/instruments/types'

export type { Baremo, Instrument, ScoringMode, Subtest } from '@/instruments/types'

/**
 * Áreas del Test ABC, en el orden de los ocho subtests. La documentación
 * disponible nombra once áreas para ocho subtests: los tres últimos nombres
 * (atención, fatigabilidad y capacidad fonemática) describen aspectos que se
 * observan de forma transversal durante la aplicación.
 */
/**
 * Los ocho subtests del Test ABC, con los nombres que usa el informe. El
 * instrumento explora además atención y fatigabilidad, que se observan de forma
 * transversal durante toda la aplicación y por eso no son un subtest aparte.
 */
const abcSubtests = [
  'Coordinación visomotora',
  'Memoria inmediata',
  'Memoria motora',
  'Evocación de palabras',
  'Memoria lógica',
  'Expresión oral / discriminación auditiva',
  'Coordinación motora / atención',
  'Capacidad fonemática',
]

const abcAreas = [...abcSubtests, 'Atención', 'Fatigabilidad']

const abcRomanos = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']

const abcEscala = [
  '0 · No logra la actividad',
  '1 · Logro inicial',
  '2 · Logro esperado',
  '3 · Logro destacado',
]

const proCalculoSubtests = [
  'Enumeración',
  'Contar oralmente para atrás',
  'Escritura de números',
  'Cálculo mental oral',
  'Lectura de números',
  'Estimación de cantidades en contexto',
  'Resolución de problemas aritméticos',
  'Adaptación',
  'Escribir en cifra',
]

const proCalculoAreas = [
  'Capacidad de transcodificación',
  'Comparaciones',
  'Semántica operatoria',
  'Habilidades para establecer analogías',
  'Reversibilidad operatoria',
]

export const instruments: Instrument[] = [
  {
    id: 'test-abc',
    version: '1.0',
    nombre: 'TEST ABC',
    subtitulo: 'Madurez para el aprendizaje',
    autor: 'Laurence Filho',
    objetivo:
      'Explorar la madurez para el aprendizaje a partir de áreas perceptivas, motoras, mnésicas, atencionales y de lenguaje documentadas.',
    edadMin: 5.5,
    edadMax: 6.5,
    rangoTexto: '5½ a 6½ años',
    tiempo: '60 a 75 minutos',
    aplicacion: 'Individual',
    descripcion:
      'Instrumento individual para madurez del aprendizaje. La fuente permite configurar estructura, áreas y baremo, pero no contiene los reactivos oficiales completos.',
    instrucciones:
      'Aplicar subtest por subtest. Cuando los reactivos oficiales no estén cargados, registrar ejecución observada, puntuación manual y observaciones del evaluador.',
    scoringMode: 'manual_score',
    unidad: { singular: 'Subtest', plural: 'subtests' },
    areas: abcAreas,
    subtests: abcRomanos.map((romano, index) => ({
      id: `abc-${index + 1}`,
      numero: index + 1,
      nombre: `${romano}. ${abcSubtests[index]}`,
      area: abcSubtests[index],
      instrucciones:
        'Reactivos oficiales pendientes de configurar por el administrador. Registrar la puntuación del subtest según el protocolo disponible del evaluador.',
      puntajeMaximo: 3,
      criterioCorreccion:
        'Puntuación manual de 0 a 3. No se generan reactivos ni criterios oficiales ausentes en la fuente.',
      tiempoEstimado: '7-9 min',
      escala: abcEscala,
    })),
    baremos: [
      { min: 17, rango: 'RANGO I', nivel: 'NIVEL SUPERIOR', descripcion: '17 puntos o más' },
      { min: 12, max: 16, rango: 'RANGO II', nivel: 'NIVEL MEDIO', descripcion: '12 a 16 puntos' },
      { min: 8, max: 11, rango: 'RANGO III', nivel: 'NIVEL INFERIOR', descripcion: '8 a 11 puntos' },
      { max: 7, rango: 'RANGO IV', nivel: 'NIVEL MAS BAJO', descripcion: '7 puntos o menos' },
    ],
    reglasInterpretacion: [
      'No generar diagnósticos clínicos automáticos.',
      'Interpretar el resultado como perfil psicopedagógico de resultados.',
    ],
    normativeStatus: 'Reactivos oficiales pendientes de configurar.',
    hasNormativeTables: false,
  },
  {
    id: 'pro-calculo',
    version: '1.0',
    nombre: 'PRO-CÁLCULO',
    subtitulo: 'Procesamiento del número y cálculo',
    autor: 'Víctor Feld, Irene Taussik y Clara Azaretto',
    objetivo: 'Determinar el procesamiento de números y cálculo del estudiante evaluado.',
    edadMin: 6,
    edadMax: 6,
    rangoTexto: 'Batería indicada para 6 años',
    tiempo: '15 a 25 minutos',
    aplicacion: 'Individual',
    descripcion:
      'Instrumento para procesamiento del número y cálculo. La conversión de PD a PT requiere tablas normativas; mientras no estén cargadas, la PT se ingresa manualmente.',
    instrucciones:
      'Registrar la PD por subárea. Ingresar la PT únicamente si proviene de una tabla normativa o fuente documental disponible.',
    scoringMode: 'pd_pt',
    unidad: { singular: 'Subárea', plural: 'subáreas' },
    areas: proCalculoAreas,
    subtests: proCalculoSubtests.map((nombre, index) => ({
      id: `pc-${index + 1}`,
      numero: index + 1,
      nombre,
      area: proCalculoAreas[index % proCalculoAreas.length],
      instrucciones:
        'Registrar la puntuación directa, la puntuación típica cuando exista fuente normativa, y las observaciones de la ejecución.',
      puntajeMaximo: 99,
      criterioCorreccion: 'PD numérica y PT manual hasta cargar las tablas normativas completas.',
      tiempoEstimado: '2-3 min',
    })),
    baremos: [
      { max: 39, rango: 'BAJO', nivel: 'PRESENTA DIFICULTADES', descripcion: 'PT menor o igual a 39' },
      { min: 40, max: 60, rango: 'NORMAL', nivel: 'NORMAL', descripcion: 'PT de 40 a 60' },
      { min: 61, rango: 'ALTO', nivel: 'ALTO', descripcion: 'PT mayor que 60' },
    ],
    reglasInterpretacion: [
      'No convertir PD a PT sin tabla normativa completa.',
      'No diagnosticar discalculia automáticamente.',
    ],
    normativeStatus: 'Conversión de PD a PT pendiente de tablas normativas.',
    hasNormativeTables: false,
  },
]

export function getInstrument(id: string) {
  return instruments.find((instrument) => instrument.id === id) ?? null
}

export function getSubtest(instrumentId: string, subtestId: string) {
  return getInstrument(instrumentId)?.subtests.find((subtest) => subtest.id === subtestId) ?? null
}
