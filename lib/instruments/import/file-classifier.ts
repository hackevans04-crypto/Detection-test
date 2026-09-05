import type { FileKind } from '@/lib/instruments/import/file-safety'
import type { PackageFileRole } from '@/lib/instruments/import/package-model'

/**
 * Clasificación de los materiales de un paquete.
 *
 * Qué es cada archivo no se decide por su nombre. Un `MANUAL MACI.pdf` suele ser
 * el manual, pero un `Documento1.pdf` también puede serlo, y una carpeta
 * renombrada por el profesional puede llamar «hoja» a lo que es el cuadernillo.
 * El nombre es una señal fuerte; el contenido es la que confirma.
 *
 * Cada clasificación sale con su confianza y con las señales que la sostienen,
 * en texto revisable. Nada de esto es definitivo: el profesional reasigna el rol
 * de cualquier archivo, y por eso `UNKNOWN` es un resultado aceptable y no un
 * fallo del que haya que salir adivinando.
 */

export type ClassificationInput = {
  path: string
  kind: FileKind
  size: number
  /** Texto extraído del documento, cuando se pudo leer algo. */
  text?: string
  /** Nombres de hoja de un libro de cálculo. */
  sheetNames?: string[]
}

export type Classification = {
  role: PackageFileRole
  confidence: number
  evidence: string[]
}

type Signal = {
  role: PackageFileRole
  /** Palabras que apuntan a ese rol, ya normalizadas. */
  terms: string[]
  weight: number
}

const nameSignals: Signal[] = [
  { role: 'MANUAL', terms: ['manual', 'handbook', 'guia tecnica', 'guia del examinador'], weight: 0.55 },
  { role: 'QUESTION_BOOKLET', terms: ['cuadernillo', 'booklet', 'items', 'reactivos', 'lamina', 'laminas'], weight: 0.55 },
  { role: 'STIMULUS_BOOK', terms: ['estimulo', 'estimulos', 'stimulus', 'lamina', 'laminas'], weight: 0.5 },
  { role: 'ANSWER_SHEET', terms: ['hoja de respuesta', 'hoja de respuestas', 'respuestas', 'answer sheet', 'hoja de anotacion', 'protocolo', 'protocolos'], weight: 0.6 },
  { role: 'SCORING_TEMPLATE', terms: ['plantilla', 'correccion', 'clave', 'scoring', 'puntuacion'], weight: 0.5 },
  { role: 'CORRECTION_GUIDE', terms: ['guia de correccion', 'correccion', 'criterios de correccion', 'correction guide'], weight: 0.5 },
  { role: 'NORMS', terms: ['baremo', 'baremos', 'norma', 'normas', 'tablas', 'percentil'], weight: 0.55 },
  { role: 'INSTRUCTIONS', terms: ['instruccion', 'instrucciones', 'aplicacion', 'consignas'], weight: 0.45 },
  { role: 'REPORT_TEMPLATE', terms: ['informe', 'reporte', 'modelo de informe', 'plantilla de informe'], weight: 0.5 },
  { role: 'EXAMPLE', terms: ['ejemplo', 'muestra', 'caso', 'demo'], weight: 0.4 },
]

const textSignals: Signal[] = [
  { role: 'MANUAL', terms: ['ficha tecnica', 'fiabilidad', 'validez', 'poblacion', 'administracion', 'interpretacion'], weight: 0.3 },
  { role: 'QUESTION_BOOKLET', terms: ['marque', 'senale', 'responde', 'item 1', 'pregunta 1'], weight: 0.3 },
  { role: 'STIMULUS_BOOK', terms: ['estimulo', 'lamina de estimulo', 'material de estimulo'], weight: 0.25 },
  { role: 'ANSWER_SHEET', terms: ['nombre del examinado', 'fecha de nacimiento', 'edad', 'examinador'], weight: 0.25 },
  { role: 'CORRECTION_GUIDE', terms: ['criterios de correccion', 'clave de correccion', 'puntuacion directa'], weight: 0.25 },
  { role: 'NORMS', terms: ['percentil', 'puntuacion tipica', 'centil', 'baremo'], weight: 0.3 },
]

const sheetSignals: Signal[] = [
  { role: 'NORMS', terms: ['baremo', 'norma', 'percentil', 'tabla'], weight: 0.3 },
  { role: 'SCORING_TEMPLATE', terms: ['correccion', 'clave', 'puntuacion', 'calculo'], weight: 0.25 },
  { role: 'REPORT_TEMPLATE', terms: ['informe', 'reporte'], weight: 0.25 },
]

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Acumula las señales encontradas.
 *
 * Cada término que aparece suma, no sólo el primero: un documento que menciona
 * población, administración, validez e interpretación es un manual con mucha
 * más seguridad que uno que menciona una sola de esas cosas, y quedarse en la
 * primera coincidencia dejaba ambos casos con idéntica puntuación —por debajo
 * del umbral—. Los términos siguientes pesan menos que el primero para que un
 * documento no se clasifique por repetir vocabulario.
 */
function scoreSignals(haystack: string, signals: Signal[], scores: Map<PackageFileRole, number>, evidence: string[], label: string) {
  for (const signal of signals) {
    const hits = signal.terms.filter((term) => haystack.includes(term))
    if (hits.length === 0) continue

    const score = hits.reduce((total, _hit, index) => total + signal.weight / (index + 1), 0)
    scores.set(signal.role, (scores.get(signal.role) ?? 0) + score)
    evidence.push(`${label}: ${hits.map((hit) => `«${hit}»`).join(', ')}`)
  }
}

export function classifyFile(input: ClassificationInput): Classification {
  const scores = new Map<PackageFileRole, number>()
  const evidence: string[] = []

  const name = normalize(input.path.split('/').pop() ?? input.path)
  scoreSignals(name, nameSignals, scores, evidence, 'Nombre')

  // Sólo se mira el principio del texto: es donde están las portadas y los
  // encabezados que identifican el documento, y evita que una mención suelta en
  // la página 200 decida el rol del archivo.
  if (input.text) {
    scoreSignals(normalize(input.text.slice(0, 4000)), textSignals, scores, evidence, 'Contenido')
  }

  if (input.sheetNames && input.sheetNames.length > 0) {
    scoreSignals(normalize(input.sheetNames.join(' ')), sheetSignals, scores, evidence, 'Hojas')
  }

  // El tipo de archivo acota lo posible: una hoja de cálculo no es un
  // cuadernillo, y una imagen suelta no es un manual.
  if (input.kind === 'spreadsheet') {
    const best = topRole(scores)
    const role: PackageFileRole =
      best && (best === 'NORMS' || best === 'SCORING_TEMPLATE' || best === 'CORRECTION_GUIDE')
        ? best
        : 'AUTOMATED_SPREADSHEET'
    evidence.push('Tipo: hoja de cálculo')
    return { role, confidence: clamp(0.55 + (scores.get(role) ?? 0)), evidence }
  }

  if (input.kind === 'image') {
    evidence.push('Tipo: imagen')
    return { role: 'IMAGE', confidence: 0.7, evidence }
  }

  if (input.kind === 'csv') {
    evidence.push('Tipo: datos tabulares')
    return { role: 'AUTOMATED_SPREADSHEET', confidence: 0.5, evidence }
  }

  const role = topRole(scores)
  if (!role) {
    return {
      role: input.kind === 'pdf' || input.kind === 'word' ? 'SUPPORT_DOCUMENT' : 'UNKNOWN',
      confidence: input.kind === 'pdf' || input.kind === 'word' ? 0.3 : 0.1,
      evidence: evidence.length > 0 ? evidence : ['Sin señales suficientes para determinar el material.'],
    }
  }

  return { role, confidence: clamp(scores.get(role) ?? 0), evidence }
}

function topRole(scores: Map<PackageFileRole, number>): PackageFileRole | null {
  let best: PackageFileRole | null = null
  let bestScore = 0
  for (const [role, score] of scores) {
    if (score > bestScore) {
      best = role
      bestScore = score
    }
  }
  // Por debajo de este umbral la señal es demasiado débil para afirmar un rol.
  return bestScore >= 0.4 ? best : null
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))))
}

/** Roles que el profesional puede asignar a mano sobre un archivo sin clasificar. */
export const assignableRoles: PackageFileRole[] = [
  'MANUAL',
  'QUESTION_BOOKLET',
  'ANSWER_SHEET',
  'STIMULUS_BOOK',
  'SCORING_TEMPLATE',
  'AUTOMATED_SPREADSHEET',
  'NORMS',
  'CORRECTION_GUIDE',
  'INSTRUCTIONS',
  'REPORT_TEMPLATE',
  'EXAMPLE',
  'IMAGE',
  'SUPPORT',
  'SUPPORT_DOCUMENT',
]
