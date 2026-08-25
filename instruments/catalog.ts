import type { Instrument } from '@/types/psychopedagogy'

const abcAreas = [
  'Coordinacion visomotora',
  'Memoria inmediata',
  'Reproduccion de movimientos / memoria motora',
  'Evocacion',
  'Memoria logica',
  'Expresion oral',
  'Discriminacion auditiva',
  'Coordinacion motora',
  'Atencion',
  'Fatigabilidad',
  'Capacidad fonematica/articulatoria',
]

export const instruments: Instrument[] = [
  {
    id: 'test-abc',
    version: '1.0',
    nombre: 'Test ABC',
    autor: 'Laurence Filho',
    objetivo: 'Explorar la madurez para el aprendizaje a partir de areas perceptivas, motoras, mnesticas, atencionales y de lenguaje documentadas.',
    edadMin: 5.5,
    edadMax: 6.5,
    rangoTexto: '5½ a 6½ anos',
    tiempo: '15 a 20 minutos',
    aplicacion: 'Individual',
    descripcion: 'Instrumento individual para madurez del aprendizaje. La fuente permite configurar estructura, areas y baremo, pero no contiene los reactivos oficiales completos.',
    instrucciones: 'Aplicar subtest por subtest. Cuando los reactivos oficiales no esten cargados, registrar ejecucion observada, puntuacion manual y observaciones del evaluador.',
    areas: abcAreas,
    subtests: Array.from({ length: 8 }).map((_, index) => ({
      id: `abc-${index + 1}`,
      numero: index + 1,
      nombre: `SUBTEST ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][index]}`,
      area: abcAreas[index] ?? abcAreas[0],
      instrucciones: 'Reactivos oficiales pendientes de configurar por el administrador. Registrar puntuacion del subtest segun protocolo disponible del evaluador.',
      puntajeMaximo: 3,
      criterioCorreccion: 'Puntuacion manual 0 a 3. No se inventan reactivos ni criterios oficiales ausentes en la fuente.',
      actividades: [
        {
          id: `abc-${index + 1}-manual-score`,
          enunciado: `Registro de puntuacion del ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][index]}`,
          instrucciones: 'Ingrese la puntuacion obtenida y observaciones cualitativas. Use solo informacion observada o protocolo validado disponible.',
          tipoRespuesta: 'manual_score',
          puntuacionMaxima: 3,
          criterio: '0 a 3 puntos registrados por evaluador.',
          obligatoria: true,
          observacion: 'Informacion normativa pendiente de configurar para reactivos oficiales.',
        },
      ],
    })),
    baremos: [
      { min: 17, rango: 'RANGO I', nivel: 'NIVEL SUPERIOR', descripcion: '17 puntos o mas' },
      { min: 12, max: 16, rango: 'RANGO II', nivel: 'NIVEL MEDIO', descripcion: '12 a 16 puntos' },
      { min: 8, max: 11, rango: 'RANGO III', nivel: 'NIVEL INFERIOR', descripcion: '8 a 11 puntos' },
      { max: 7, rango: 'RANGO IV', nivel: 'NIVEL MAS BAJO', descripcion: '7 puntos o menos' },
    ],
    reglasInterpretacion: ['No generar diagnosticos clinicos automaticos.', 'Interpretar el resultado como perfil psicopedagogico de resultados.'],
    recomendaciones: ['Estimular memoria, atencion y razonamiento cuando el resultado lo justifique.', 'Revisar recomendaciones antes de emitir informe.'],
    normativeStatus: 'Reactivos oficiales pendientes de configurar.',
  },
  {
    id: 'pro-calculo',
    version: '1.0',
    nombre: 'PRO-CALCULO',
    autor: 'Victor Feld, Irene Taussik y Clara Azaretto',
    objetivo: 'Determinar el procesamiento de numeros y calculo del estudiante evaluado.',
    edadMin: 6,
    edadMax: 6,
    rangoTexto: 'Bateria indicada para 6 anos',
    tiempo: '20 a 25 minutos',
    aplicacion: 'Individual',
    descripcion: 'Instrumento para procesamiento del numero y calculo. La conversion PD a PT requiere tablas normativas; si no estan cargadas, la PT se ingresa manualmente.',
    instrucciones: 'Registrar PD por subtest. Ingresar PT solo si proviene de tabla normativa o fuente documental disponible.',
    areas: ['Capacidad de transcodificacion', 'Comparaciones', 'Semantica operatoria', 'Habilidades para establecer analogias', 'Reversibilidad operatoria'],
    subtests: ['Enumeracion', 'Contar oralmente para atras', 'Escritura de numeros', 'Calculo mental oral', 'Lectura de numeros', 'Estimacion de cantidades en contexto', 'Resolucion de problemas aritmeticos', 'Adaptacion', 'Escribir en cifra'].map((name, index) => ({
      id: `pc-${index + 1}`,
      numero: index + 1,
      nombre: name,
      area: ['Capacidad de transcodificacion', 'Comparaciones', 'Semantica operatoria', 'Habilidades para establecer analogias', 'Reversibilidad operatoria'][index % 5],
      instrucciones: 'Registrar puntuacion directa, puntuacion transformada cuando exista fuente normativa, y observaciones.',
      puntajeMaximo: 99,
      criterioCorreccion: 'PD numerica y PT manual hasta cargar tablas normativas completas.',
      actividades: [
        {
          id: `pc-${index + 1}-pd`,
          enunciado: `${name}: puntuacion directa`,
          instrucciones: 'Ingrese PD obtenida. La PT no se calcula automaticamente sin tabla normativa.',
          tipoRespuesta: 'numeric',
          puntuacionMaxima: 99,
          criterio: 'PD registrada por evaluador.',
          obligatoria: true,
        },
        {
          id: `pc-${index + 1}-pt`,
          enunciado: `${name}: puntuacion transformada`,
          instrucciones: 'Ingrese PT manual solo si cuenta con la tabla normativa correspondiente.',
          tipoRespuesta: 'numeric',
          puntuacionMaxima: 99,
          criterio: 'PT ingresada por evaluador.',
          obligatoria: false,
          observacion: 'Informacion normativa pendiente de configurar.',
        },
      ],
    })),
    baremos: [
      { max: 39, rango: 'BAJO', nivel: 'PRESENTA DIFICULTADES', descripcion: 'PT <= 39' },
      { min: 40, max: 60, rango: 'NORMAL', nivel: 'NORMAL', descripcion: 'PT 40 a 60' },
      { min: 61, rango: 'ALTO', nivel: 'ALTO', descripcion: 'PT > 60' },
    ],
    reglasInterpretacion: ['No convertir PD a PT sin tabla normativa completa.', 'No diagnosticar discalculia automaticamente.'],
    recomendaciones: ['Refuerzo academico en subtests bajos.', 'Material visual accesible y actividades manipulativas cuando corresponda.'],
    normativeStatus: 'Conversion PD a PT pendiente de tablas normativas.',
  },
]

export const demoABC = { I: 1, II: 2, III: 2, IV: 2, V: 3, VI: 2, VII: 0, VIII: 1, TOTAL: 13 }

export const demoProCalculo = [
  ['Enumeracion', 8, 41],
  ['Contar oralmente para atras', 2, 57],
  ['Escritura de numeros', 4, 55],
  ['Calculo mental oral', 2, 38],
  ['Lectura de numeros', 8, 65],
  ['Estimacion de cantidades en contexto', 6, 57],
  ['Resolucion de problemas aritmeticos', 2, 43],
  ['Adaptacion', 0, 38],
  ['Escribir en cifra', 2, 61],
] as const

export function getInstrument(id: string) {
  return instruments.find((instrument) => instrument.id === id) ?? null
}
