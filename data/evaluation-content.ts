export type EvaluationCase = {
  id: string
  code: string
  name: string
  age: number
  grade: string
  type: 'Simulado' | 'Institucional' | 'Practica'
  evaluations: number
  status: 'En evaluación' | 'Completado' | 'Archivado' | 'Activo'
  lastUpdated: string
  background: string[]
  reason: string
}

export const evaluationCases: EvaluationCase[] = [
  {
    id: 'case-001',
    code: 'CASO-00012',
    name: 'José Medrano',
    age: 6,
    grade: '1ro EGB',
    type: 'Simulado',
    evaluations: 2,
    status: 'En evaluación',
    lastUpdated: '2026-08-24',
    background: ['Contexto familiar estable', 'Dificultades en atención', 'Antecedentes de lectura inicial'],
    reason: 'Se observa dificultad en atención sostenida y comprensión de instrucciones.',
  },
  {
    id: 'case-002',
    code: 'CASO-00018',
    name: 'Valentina Ruiz',
    age: 7,
    grade: '2do EGB',
    type: 'Institucional',
    evaluations: 1,
    status: 'Completado',
    lastUpdated: '2026-08-20',
    background: ['Matemática con dificultades persistentes', 'Apoyo docente', 'Historial académico regular'],
    reason: 'Solicitud de valoración por dificultades en cálculo y resolución de problemas.',
  },
  {
    id: 'case-003',
    code: 'CASO-00023',
    name: 'Mateo Sánchez',
    age: 5,
    grade: 'Preparatoria',
    type: 'Practica',
    evaluations: 0,
    status: 'Activo',
    lastUpdated: '2026-08-18',
    background: ['Caso académico en práctica', 'Perfil de observación', 'Sin información crítica relevante'],
    reason: 'Práctica de exploración de madurez para el aprendizaje.',
  },
]

export type InstrumentSummary = {
  id: string
  name: string
  author: string
  area: string
  ageMin: number
  ageMax: number
  application: string
  subtests: number
  duration: string
  status: 'VALIDADO' | 'PENDIENTE' | 'PRÁCTICA'
  description: string
}

export const instruments: InstrumentSummary[] = [
  {
    id: 'abc',
    name: 'Test ABC',
    author: 'Laurence Filho',
    area: 'Madurez para el aprendizaje',
    ageMin: 5,
    ageMax: 6,
    application: 'Individual',
    subtests: 8,
    duration: '15–20 min',
    status: 'VALIDADO',
    description: 'Explora la madurez relacionada con el aprendizaje a través de coordinación visomotora, memoria y atención.',
  },
  {
    id: 'pro-calculo',
    name: 'PRO-CÁLCULO',
    author: 'Víctor Feld, Irene Taussik, Clara Azaretto',
    area: 'Procesamiento del número y cálculo',
    ageMin: 6,
    ageMax: 6,
    application: 'Individual',
    subtests: 9,
    duration: '20–25 min',
    status: 'VALIDADO',
    description: 'Determina el procesamiento numérico y las habilidades operatorias del caso evaluado.',
  },
  {
    id: 'ppr',
    name: 'Pauta de observación pedagógica',
    author: 'Equipo docente',
    area: 'Observación',
    ageMin: 4,
    ageMax: 12,
    application: 'Grupal',
    subtests: 5,
    duration: '10–15 min',
    status: 'PENDIENTE',
    description: 'Herramienta de observación para analizar conducta e intervención en el contexto escolar.',
  },
]
