export type InstrumentStatus = 'validated' | 'pending' | 'draft' | 'partial'

export type InstrumentSubtest = {
  id: string
  name: string | null
  objective: string | null
  instructions: string | null
  material: string | null
  type: string | null
  maxScore: number | null
}

export type InstrumentSource = {
  name: string
  author: string
  version: string | null
  documentSource: string | null
  date: string | null
  status: 'Validado' | 'Pendiente'
}

export type AssessmentQuestion = {
  id: string
  prompt: string
  options: string[]
  correctIndex: number
  skill: string
  rationale: string
}

export type AssessmentSummary = {
  score: number
  maxScore: number
  level: string
  summary: string
  recommendations: string[]
}

export type Instrument = {
  id: string
  slug: string
  name: string
  authors: string[]
  area: string
  ageRange: string
  applicationType: string
  description: string
  duration: string | null
  status: InstrumentStatus
  contentStatus: 'VALIDATED' | 'PARTIAL' | 'DRAFT' | 'MISSING'
  objective: string | null
  areas: string[]
  subtests: InstrumentSubtest[]
  questions?: AssessmentQuestion[]
  source: InstrumentSource
  instructions: string | null
  materials: string[] | null
  considerations: string | null
  scoringNotes: string | null
  norms: Array<{ puntaje: string; rango: string; nivel: string }>
}

const testAbcQuestions: AssessmentQuestion[] = [
  {
    id: 'abc-1',
    prompt: 'Si observa la secuencia A-B-A-B-A, ¿cuál es la respuesta correcta para continuar?',
    options: ['A', 'B', 'C', 'D'],
    correctIndex: 0,
    skill: 'Memoria secuencial',
    rationale: 'Reconoce la continuidad lógica de la secuencia.',
  },
  {
    id: 'abc-2',
    prompt: '¿Qué acción demuestra mejor atención visual sostenida?',
    options: ['Seguir una línea de puntos con la vista', 'Pedir ayuda para opinar', 'Hablar sin mirar al estímulo', 'Ignorar la instrucción'],
    correctIndex: 0,
    skill: 'Atención selectiva',
    rationale: 'La atención visual sostenida requiere seguir un estímulo concreto.',
  },
  {
    id: 'abc-3',
    prompt: 'Cuando se le pide repetir una serie de palabras, lo más importante es:',
    options: ['Recordar el orden y la cantidad', 'Cambiar el contenido', 'No responder', 'Hablar más rápido'],
    correctIndex: 0,
    skill: 'Memoria verbal',
    rationale: 'La tarea valora reproducción precisa de la secuencia presentada.',
  },
  {
    id: 'abc-4',
    prompt: '¿Qué respuesta refleja mejor coordinación visomotora?',
    options: ['Copiar una figura con lápiz siguiendo un modelo', 'Contestar sin mirar', 'Escuchar sin actuar', 'Gritar la respuesta'],
    correctIndex: 0,
    skill: 'Coordinación',
    rationale: 'La coordinación visomotora implica integrar percepción visual y acción motora.',
  },
  {
    id: 'abc-5',
    prompt: 'Si el niño no comprende la instrucción verbal inicial, lo más recomendable es:',
    options: ['Repetir la instrucción con apoyo y modelo visual', 'Cambiar la tarea sin explicación', 'Evitar responder', 'Dar la respuesta correcta de inmediato'],
    correctIndex: 0,
    skill: 'Comprensión de instrucciones',
    rationale: 'La claridad y la modelación ayudan a validar la comprensión real.',
  },
  {
    id: 'abc-6',
    prompt: '¿Qué indica mejor la capacidad de discriminación auditiva?',
    options: ['Distinguir sonidos y palabras parecidas', 'Apuntar sin escuchar', 'No seguir una instrucción', 'Hablar sin pausa'],
    correctIndex: 0,
    skill: 'Discriminación auditiva',
    rationale: 'La discriminación auditiva requiere diferenciar estímulos sonoros similares.',
  },
  {
    id: 'abc-7',
    prompt: 'Cuando se pide copiar un gesto observado, la habilidad evaluada es:',
    options: ['Imitación motora y memoria visual', 'Lectura compleja', 'Memoria remota solo', 'Cálculo mental'],
    correctIndex: 0,
    skill: 'Imitación motora',
    rationale: 'El gesto exige reproducir con precisión lo percibido.',
  },
  {
    id: 'abc-8',
    prompt: '¿Qué muestra mejor organización del pensamiento?',
    options: ['Resolver primero la tarea más sencilla y luego la compleja', 'Responder al azar', 'No seguir ningún orden', 'Ignorar el objetivo'],
    correctIndex: 0,
    skill: 'Planificación',
    rationale: 'Organizar la secuencia de resolución favorece la ejecución adecuada.',
  },
  {
    id: 'abc-9',
    prompt: 'Si el participante se distrae con facilidad durante la prueba, esto puede sugerir:',
    options: ['Dificultades de atención', 'Excelente dominio de la prueba', 'Falta de material', 'No procede evaluar'],
    correctIndex: 0,
    skill: 'Atención',
    rationale: 'La distracción frecuente puede impactar la ejecución dentro del protocolo.',
  },
  {
    id: 'abc-10',
    prompt: '¿Cuál es la mejor forma de registrar la respuesta del participante?',
    options: ['Anotar la respuesta exacta y el nivel de apoyo requerido', 'No dejar evidencia', 'Inventar la respuesta', 'Solo registrar el tiempo'],
    correctIndex: 0,
    skill: 'Registro observacional',
    rationale: 'El registro debe reflejar la ejecución real y los apoyos necesarios.',
  },
]

const proCalculoQuestions: AssessmentQuestion[] = [
  {
    id: 'pc-1',
    prompt: '¿Cuánto es 4 + 3?',
    options: ['6', '7', '8', '9'],
    correctIndex: 1,
    skill: 'Sumas básicas',
    rationale: 'La suma de 4 y 3 da 7.',
  },
  {
    id: 'pc-2',
    prompt: 'Si cuentas de 2 en 2 desde 2, ¿cuál viene después de 8?',
    options: ['10', '9', '8', '11'],
    correctIndex: 0,
    skill: 'Secuencia numérica',
    rationale: 'La secuencia continúa 2, 4, 6, 8, 10.',
  },
  {
    id: 'pc-3',
    prompt: '¿Qué número corresponde a “ocho”?',
    options: ['7', '8', '9', '6'],
    correctIndex: 1,
    skill: 'Reconocimiento del número',
    rationale: 'El símbolo que representa ocho es 8.',
  },
  {
    id: 'pc-4',
    prompt: '¿Cuánto es 9 - 4?',
    options: ['3', '4', '5', '6'],
    correctIndex: 2,
    skill: 'Resta básica',
    rationale: '9 menos 4 es igual a 5.',
  },
  {
    id: 'pc-5',
    prompt: 'Si tienes 5 manzanas y te regalan 2 más, ¿cuántas tienes?',
    options: ['6', '7', '8', '9'],
    correctIndex: 1,
    skill: 'Adición contextual',
    rationale: '5 + 2 = 7.',
  },
  {
    id: 'pc-6',
    prompt: '¿Cuál es la mayor cantidad entre estas?',
    options: ['12', '9', '15', '11'],
    correctIndex: 2,
    skill: 'Comparación numérica',
    rationale: '15 es el número mayor de las opciones presentadas.',
  },
  {
    id: 'pc-7',
    prompt: '¿Qué significa la palabra “doble” en matemáticas?',
    options: ['Sumar dos veces la misma cantidad', 'Restar uno', 'Dividir entre dos', 'Ignorar la cantidad'],
    correctIndex: 0,
    skill: 'Conceptos numéricos',
    rationale: 'Doble equivale a multiplicar por dos o sumar dos veces.',
  },
  {
    id: 'pc-8',
    prompt: '¿Cuál es el resultado de 3 × 2?',
    options: ['5', '6', '7', '8'],
    correctIndex: 1,
    skill: 'Multiplicación básica',
    rationale: '3 por 2 equivale a 6.',
  },
  {
    id: 'pc-9',
    prompt: 'Si hay 10 elementos y quitas 3, ¿cuántos quedan?',
    options: ['6', '7', '8', '9'],
    correctIndex: 2,
    skill: 'Resta aplicada',
    rationale: '10 - 3 = 7.',
  },
  {
    id: 'pc-10',
    prompt: '¿Qué hace más fácil resolver un problema matemático?',
    options: ['Identificar la operación y la cantidad', 'Adivinar sin leer', 'No usar números', 'Correr la respuesta'],
    correctIndex: 0,
    skill: 'Comprensión del problema',
    rationale: 'El análisis del enunciado ayuda a seleccionar la operación adecuada.',
  },
]

export const instrumentCatalog: Instrument[] = [
  {
    id: 'test-abc',
    slug: 'test-abc',
    name: 'TEST ABC',
    authors: ['Laurence Filho'],
    area: 'Madurez para el aprendizaje',
    ageRange: '5½ a 6½ años',
    applicationType: 'Individual',
    description:
      'Instrumento orientado a explorar la madurez relacionada con el aprendizaje.',
    duration: '15–20 min',
    status: 'validated',
    contentStatus: 'VALIDATED',
    objective:
      'Explorar la madurez relacionada con el aprendizaje mediante la observación de habilidades cognitivas, perceptivas y motoras.',
    areas: [
      'coordinación visomotora',
      'memoria inmediata',
      'reproducción de movimientos / memoria motora',
      'evocación de palabras',
      'memoria lógica',
      'expresión oral y discriminación auditiva',
      'coordinación motora',
      'atención',
      'fatigabilidad',
      'capacidad fonemática/articulatoria',
    ],
    instructions:
      'Se aplica de forma individual y se administra siguiendo el protocolo del instrumento original.',
    materials: ['Materiales del protocolo del instrumento', 'Formato de registro'],
    considerations:
      'Debe interpretarse dentro del contexto del caso y del proceso de evaluación general.',
    scoringNotes:
      'Los criterios específicos de puntuación deben provenir del protocolo validado.',
    subtests: [
      { id: 'abc-1', name: 'Subtest 1 — Pendiente de configuración', objective: null, instructions: null, material: null, type: null, maxScore: null },
      { id: 'abc-2', name: 'Subtest 2 — Pendiente de configuración', objective: null, instructions: null, material: null, type: null, maxScore: null },
      { id: 'abc-3', name: 'Subtest 3 — Pendiente de configuración', objective: null, instructions: null, material: null, type: null, maxScore: null },
      { id: 'abc-4', name: 'Subtest 4 — Pendiente de configuración', objective: null, instructions: null, material: null, type: null, maxScore: null },
      { id: 'abc-5', name: 'Subtest 5 — Pendiente de configuración', objective: null, instructions: null, material: null, type: null, maxScore: null },
      { id: 'abc-6', name: 'Subtest 6 — Pendiente de configuración', objective: null, instructions: null, material: null, type: null, maxScore: null },
      { id: 'abc-7', name: 'Subtest 7 — Pendiente de configuración', objective: null, instructions: null, material: null, type: null, maxScore: null },
      { id: 'abc-8', name: 'Subtest 8 — Pendiente de configuración', objective: null, instructions: null, material: null, type: null, maxScore: null },
    ],
    questions: testAbcQuestions,
    source: {
      name: 'TEST ABC',
      author: 'Laurence Filho',
      version: 'Versión base',
      documentSource: 'Protocolos documentados en la base interna de Detection-test',
      date: '2026-08-24',
      status: 'Validado',
    },
    norms: [],
  },
  {
    id: 'pro-calculo',
    slug: 'pro-calculo',
    name: 'PRO-CÁLCULO',
    authors: ['Víctor Feld', 'Irene Taussik', 'Clara Azaretto'],
    area: 'Procesamiento del número y cálculo',
    ageRange: 'Batería para 6 años',
    applicationType: 'Individual',
    description:
      'Instrumento relacionado con el procesamiento numérico y cálculo.',
    duration: null,
    status: 'partial',
    contentStatus: 'PARTIAL',
    objective:
      'Explorar el procesamiento numérico y el cálculo mediante tareas de conteo, lectura y escritura de números, y resolución de situaciones aritméticas.',
    areas: ['Enumeración', 'Cálculo mental oral', 'Resolución de problemas aritméticos'],
    instructions: null,
    materials: null,
    considerations:
      'El protocolo detallado de aplicación todavía no ha sido cargado o validado.',
    scoringNotes:
      'Los criterios específicos de puntuación deben provenir del protocolo validado.',
    subtests: [
      { id: 'pc-1', name: 'Enumeración', objective: null, instructions: null, material: null, type: null, maxScore: null },
      { id: 'pc-2', name: 'Contar oralmente para atrás', objective: null, instructions: null, material: null, type: null, maxScore: null },
      { id: 'pc-3', name: 'Escritura de números', objective: null, instructions: null, material: null, type: null, maxScore: null },
      { id: 'pc-4', name: 'Cálculo mental oral', objective: null, instructions: null, material: null, type: null, maxScore: null },
      { id: 'pc-5', name: 'Lectura de números', objective: null, instructions: null, material: null, type: null, maxScore: null },
      { id: 'pc-6', name: 'Estimación de cantidades en contexto', objective: null, instructions: null, material: null, type: null, maxScore: null },
      { id: 'pc-7', name: 'Resolución de problemas aritméticos', objective: null, instructions: null, material: null, type: null, maxScore: null },
      { id: 'pc-8', name: 'Adaptación', objective: null, instructions: null, material: null, type: null, maxScore: null },
      { id: 'pc-9', name: 'Escribir en cifra', objective: null, instructions: null, material: null, type: null, maxScore: null },
    ],
    questions: proCalculoQuestions,
    source: {
      name: 'PRO-CÁLCULO',
      author: 'Víctor Feld, Irene Taussik, Clara Azaretto',
      version: 'Batería base',
      documentSource: 'Documentación interna disponible en Detection-test',
      date: '2026-08-24',
      status: 'Pendiente',
    },
    norms: [],
  },
]

export const instrumentIndex = Object.fromEntries(
  instrumentCatalog.map((instrument) => [instrument.id, instrument]),
) as Record<string, Instrument>

export function getAssessmentSummary(instrument: Instrument, answers: Record<string, number>): AssessmentSummary {
  const questions = instrument.questions ?? []
  const maxScore = questions.length
  const score = questions.reduce((total, question) => {
    const answer = answers[question.id]
    return total + (answer === question.correctIndex ? 1 : 0)
  }, 0)

  if (score >= Math.ceil(maxScore * 0.8)) {
    return {
      score,
      maxScore,
      level: 'Alto rendimiento',
      summary: 'El participante muestra un nivel sólido de ejecución para esta dimensión evaluada.',
      recommendations: ['Mantener la estimulación actual.', 'Reforzar la generalización del aprendizaje en contextos reales.'],
    }
  }

  if (score >= Math.ceil(maxScore * 0.55)) {
    return {
      score,
      maxScore,
      level: 'Rendimiento medio',
      summary: 'El participante presenta avances adecuados, pero aún requiere apoyo puntual en algunas áreas.',
      recommendations: ['Trabajar con ejercicios guiados.', 'Reforzar la atención y la comprensión de instrucciones.'],
    }
  }

  return {
    score,
    maxScore,
    level: 'Necesita apoyo',
    summary: 'El participante requiere una intervención más directa y apoyo pedagógico específico.',
    recommendations: ['Programar refuerzo individualizado.', 'Trabajar secuencias simples, observación guiada y práctica gradual.'],
  }
}

export function getInstrumentById(id: string) {
  return instrumentCatalog.find((instrument) => instrument.id === id) ?? null
}
