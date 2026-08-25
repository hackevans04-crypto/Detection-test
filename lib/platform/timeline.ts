export const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export function smoothstep(from: number, to: number, value: number) {
  const t = clamp01((value - from) / Math.max(to - from, 0.00001))
  return t * t * (3 - 2 * t)
}

export function smootherstep(from: number, to: number, value: number) {
  const t = clamp01((value - from) / Math.max(to - from, 0.00001))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

export const PLATFORM_BEATS = {
  HANDOFF: [0, 0.08],
  REVEAL: [0.08, 0.18],
  ORBIT: [0.18, 0.36],
  EXPLOSION: [0.36, 0.5],
  MODULE_PASS: [0.5, 0.6],
  CORE_DESCENT: [0.56, 0.67],
  DATA_ORBIT: [0.67, 0.79],
  REASSEMBLY: [0.79, 0.91],
  EXIT: [0.91, 1],
} as const

export const CONCEPTS = [
  { key: 'evaluation', index: '01', title: 'Evaluación', description: 'Organiza instrumentos, registros y resultados dentro de un mismo flujo.', window: [0.55, 0.66] },
  { key: 'organization', index: '02', title: 'Organización', description: 'Centraliza información para que el proceso sea trazable y comprensible.', window: [0.63, 0.72] },
  { key: 'analysis', index: '03', title: 'Análisis', description: 'Convierte los datos registrados en información clara para el especialista.', window: [0.69, 0.79] },
  { key: 'inclusion', index: '04', title: 'Inclusión', description: 'Acompaña el proceso considerando las necesidades de cada estudiante.', window: [0.77, 0.88] },
] as const

export function conceptFrame(progress: number, window: readonly number[]) {
  const [from, to] = window
  const span = to - from
  const local = clamp01((progress - from) / span)
  const enter = smootherstep(0, 0.18, local)
  const exit = 1 - smootherstep(0.82, 1, local)
  return {
    local,
    visibility: enter * exit,
    connector: smootherstep(0.04, 0.22, local),
    signal: smootherstep(0.14, 0.36, local),
    title: smootherstep(0.22, 0.42, local),
    body: smootherstep(0.34, 0.54, local) * exit,
  }
}

export const assemblyWeight = (progress: number) => {
  // Reconocimiento primero, apertura mecánica después. La ventana más amplia
  // deja leer bloqueo → tapa → frente → laterales → racks sin saltos.
  const open = smootherstep(0.38, 0.57, progress)
  const close = 1 - smootherstep(0.84, 0.94, progress)
  return Math.min(open, close)
}

export function platformChapterLength(width: number) {
  if (width < 640) return 5.2
  if (width < 1024) return 6.2
  return 7.4
}
