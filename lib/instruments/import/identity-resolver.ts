import type { InstrumentPackage, PackageFingerprint } from '@/lib/instruments/import/package-model'
import {
  findInstrumentRegistryEntry,
  getInstrumentRegistry,
  normalizeInstrumentText,
  type InstrumentRegistryEntry,
} from '@/lib/instruments/instrument-registry'

/**
 * Identidad de un instrumento a partir de su material.
 *
 * Un mismo instrumento puede llegar en varios archivos: manual, cuadernillo,
 * hoja de respuestas, baremos o una hoja de calculo. Esta capa decide si el
 * material nuevo pertenece a un paquete existente o si debe iniciar otro, sin
 * asumir que el nombre del archivo suelto es el nombre clinico del instrumento.
 */

export type IdentityMatch =
  | { kind: 'DUPLICATE'; packageId: string; detail: string }
  | { kind: 'SAME_INSTRUMENT'; packageId: string; confidence: number; detail: string }
  | { kind: 'POSSIBLE_VERSION'; packageId: string; detail: string }
  | { kind: 'NEW'; detail: string }

export function normalizeName(value: string) {
  return normalizeInstrumentText(value)
}

export type ResolvedInstrumentIdentity = {
  name: string
  subtitle: string
  acronym: string | null
  confidence: number
}

function identityHintOf(value: string): InstrumentRegistryEntry | null {
  return findInstrumentRegistryEntry([value])
}

function acronymHintOf(value: string): string | null {
  return identityHintOf(value)?.acronym ?? null
}

export function acronymOf(value: string): string | null {
  const hinted = acronymHintOf(value)
  if (hinted) return hinted

  const candidates = value.match(/\b[A-Z][A-Z0-9-]{2,9}\b/g)
  if (!candidates) return null

  const noise = new Set([
    'MANUAL', 'MANUALES', 'HOJA', 'HOJAS', 'RESPUESTA', 'RESPUESTAS',
    'CUADERNILLO', 'CUADERNILLOS', 'PROTOCOLO', 'PROTOCOLOS', 'PLANTILLA',
    'CORRECCION', 'PUNTUACION', 'PUNTUACIONES', 'BAREMO', 'BAREMOS',
    'NORMA', 'NORMAS', 'TABLA', 'TABLAS', 'INSTRUCCION', 'INSTRUCCIONES',
    'APLICACION', 'INFORME', 'INFORMES', 'ANEXO', 'ANEXOS', 'EJEMPLO',
    'EJEMPLOS', 'COPIA', 'FINAL', 'NUEVO', 'NUEVA', 'VERSION', 'TEST',
    'ITEMS', 'LAMINAS', 'MATERIAL', 'MATERIALES', 'DOCUMENTO', 'DOCUMENTOS',
    'ANSIEDAD', 'ESTADO', 'RASGO', 'CUESTIONARIO', 'CUESTIONARIOS',
    'INVENTARIO', 'INVENTARIOS', 'ESCALA', 'ESCALAS', 'FORMA', 'FORMAS',
    'AUTOEVALUACION', 'AUTOINFORME', 'PSICOLOGICO', 'PSICOLOGICA',
    'PSICOMETRICO', 'PSICOMETRICA', 'FUNCIONES', 'EJECUTIVAS',
    'PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'XLSM', 'CSV', 'ZIP', 'RAR',
    'DEL', 'LAS', 'LOS', 'CON', 'PARA', 'POR',
  ])

  const meaningful = candidates.filter((candidate) => !noise.has(candidate))
  return meaningful.length > 0 ? meaningful[meaningful.length - 1] : null
}

export function resolveInstrumentIdentity(values: Array<string | null | undefined>): ResolvedInstrumentIdentity {
  const evidence = values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))
  const joined = evidence.join(' ')
  const hint = identityHintOf(joined)

  if (hint) {
    return {
      name: hint.displayName,
      subtitle: hint.subtitle,
      acronym: hint.acronym,
      confidence: 0.9,
    }
  }

  for (const value of evidence) {
    const acronym = acronymOf(value)
    if (acronym) {
      const registered = getInstrumentRegistry().find((entry) => entry.acronym === acronym)
      return {
        name: registered?.displayName ?? acronym,
        subtitle: registered?.subtitle ?? 'Instrumento incorporado al expediente',
        acronym,
        confidence: 0.7,
      }
    }
  }

  return {
    name: 'Instrumento sin identificar',
    subtitle: 'Material incorporado al expediente',
    acronym: null,
    confidence: 0,
  }
}

function overlap(a: string[], b: string[]) {
  if (a.length === 0 || b.length === 0) return 0
  const set = new Set(a.map(normalizeName))
  const hits = b.filter((value) => set.has(normalizeName(value))).length
  return hits / Math.max(a.length, b.length)
}

export function resolveIdentity(
  incoming: PackageFingerprint,
  existing: InstrumentPackage[],
): IdentityMatch {
  for (const pkg of existing) {
    const shared = incoming.checksums.filter((checksum) => pkg.fingerprint.checksums.includes(checksum))
    if (shared.length > 0 && shared.length === incoming.checksums.length) {
      return {
        kind: 'DUPLICATE',
        packageId: pkg.id,
        detail: 'Este material ya fue incorporado.',
      }
    }
  }

  let best: { pkg: InstrumentPackage; score: number } | null = null

  for (const pkg of existing) {
    const other = pkg.fingerprint
    let score = 0

    if (incoming.acronym && other.acronym && incoming.acronym === other.acronym) score += 0.5
    if (incoming.normalizedName && other.normalizedName) {
      if (incoming.normalizedName === other.normalizedName) score += 0.35
      else if (
        incoming.normalizedName.includes(other.normalizedName) ||
        other.normalizedName.includes(incoming.normalizedName)
      ) {
        score += 0.2
      }
    }
    score += overlap(incoming.authors, other.authors) * 0.15
    score += overlap(incoming.scales, other.scales) * 0.15
    if (incoming.itemCount && other.itemCount && incoming.itemCount === other.itemCount) score += 0.15

    if (!best || score > best.score) best = { pkg, score }
  }

  if (!best || best.score < 0.5) {
    return { kind: 'NEW', detail: 'No se reconoce como material de un instrumento ya incorporado.' }
  }

  const versionDiffers =
    Boolean(incoming.version) &&
    Boolean(best.pkg.fingerprint.version) &&
    incoming.version !== best.pkg.fingerprint.version

  const itemsDiffer =
    Boolean(incoming.itemCount) &&
    Boolean(best.pkg.fingerprint.itemCount) &&
    incoming.itemCount !== best.pkg.fingerprint.itemCount

  if (versionDiffers || itemsDiffer) {
    return {
      kind: 'POSSIBLE_VERSION',
      packageId: best.pkg.id,
      detail: 'Se detecto una posible version diferente del mismo instrumento.',
    }
  }

  return {
    kind: 'SAME_INSTRUMENT',
    packageId: best.pkg.id,
    confidence: Number(best.score.toFixed(2)),
    detail: 'Estos archivos parecen pertenecer al instrumento ya incorporado.',
  }
}

export function mergeFingerprints(base: PackageFingerprint, incoming: PackageFingerprint): PackageFingerprint {
  return {
    normalizedName: base.normalizedName ?? incoming.normalizedName,
    acronym: base.acronym ?? incoming.acronym,
    authors: [...new Set([...base.authors, ...incoming.authors])],
    version: base.version ?? incoming.version,
    itemCount: base.itemCount ?? incoming.itemCount,
    scales: [...new Set([...base.scales, ...incoming.scales])],
    checksums: [...new Set([...base.checksums, ...incoming.checksums])],
  }
}
