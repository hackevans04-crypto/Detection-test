/**
 * Verificación de los archivos que entran al importador.
 *
 * El nombre de un archivo es una afirmación del usuario, no un hecho. Un
 * `manual.pdf` puede ser un ejecutable renombrado, y un `.jpg` puede no tener
 * nada dentro. Aquí se comprueba lo que se puede comprobar de verdad: los
 * primeros bytes, el tamaño, la coherencia entre extensión y contenido, y la
 * huella.
 *
 * La política es de lista blanca. Lo que no se reconoce no se rechaza por
 * sistema -un profesional puede subir material legítimo con un formato raro-,
 * pero sí se marca; lo que es ejecutable se bloquea siempre, venga como venga.
 */

export type FileKind =
  | 'pdf'
  | 'word'
  | 'spreadsheet'
  | 'csv'
  | 'text'
  | 'json'
  | 'image'
  | 'zip'
  | 'rar'
  | 'unknown'

export type SafetyVerdict = {
  ok: boolean
  kind: FileKind
  detectedMime: string | null
  /** `true` cuando es ruido del sistema de archivos y no material del paquete. */
  ignorable: boolean
  reason: string
  warnings: string[]
}

/** 40 MB por archivo. Un manual escaneado grande cabe; un vertido, no. */
export const MAX_FILE_SIZE = 40 * 1024 * 1024
/** 300 MB por paquete. Los RAR reales de baterías completas pueden superar 200 MB antes de abrirse. */
export const MAX_PACKAGE_SIZE = 300 * 1024 * 1024
/** Tope de archivos extraídos de un comprimido. */
export const MAX_PACKAGE_ENTRIES = 400
/** Un comprimido dentro de otro se abre; el tercer nivel ya no. */
export const MAX_ARCHIVE_DEPTH = 2
/** Relación máxima entre lo descomprimido y lo comprimido. */
export const MAX_COMPRESSION_RATIO = 120

/**
 * Extensiones que no se procesan nunca, aunque el contenido parezca inofensivo.
 * No hay material psicopedagógico legítimo con estas extensiones.
 */
const blockedExtensions = new Set([
  'exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'msp', 'dll', 'sys', 'drv',
  'ps1', 'psm1', 'vbs', 'vbe', 'wsf', 'wsh', 'hta', 'jar', 'app', 'apk',
  'deb', 'rpm', 'dmg', 'pkg', 'sh', 'bash', 'zsh', 'run', 'bin', 'elf',
  'lnk', 'url', 'reg', 'cpl', 'gadget', 'jse', 'pif',
])

/** Ruido del sistema de archivos: se ignora sin que rompa el paquete. */
const ignorableNames = new Set([
  '.ds_store', 'thumbs.db', 'desktop.ini', '.picasa.ini', 'picasa.ini',
  'ehthumbs.db', 'icon\r', '.spotlight-v100', '.trashes', '.fseventsd',
])

const ignorablePrefixes = ['._', '~$', '.~lock.']

const extensionKinds: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'word', docx: 'word', odt: 'word', rtf: 'word',
  xls: 'spreadsheet', xlsx: 'spreadsheet', xlsm: 'spreadsheet', ods: 'spreadsheet',
  csv: 'csv',
  txt: 'text', md: 'text',
  json: 'json',
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', tif: 'image', tiff: 'image', gif: 'image', bmp: 'image',
  zip: 'zip',
  rar: 'rar',
}

export function extensionOf(name: string) {
  const match = /\.([A-Za-z0-9]+)$/.exec(name.trim())
  return match ? match[1].toLowerCase() : ''
}

export function isIgnorableName(path: string) {
  const name = path.split(/[/\\]/).pop()?.toLowerCase() ?? ''
  if (ignorableNames.has(name)) return true
  if (ignorablePrefixes.some((prefix) => name.startsWith(prefix))) return true
  // Carpetas de metadatos que algunos compresores arrastran.
  return /(^|\/)__macosx\//i.test(path) || /(^|\/)\.git\//i.test(path)
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  if (bytes.length < offset + signature.length) return false
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

/**
 * Tipo real deducido de los primeros bytes. Devuelve `null` cuando ninguna
 * firma conocida coincide, que no es lo mismo que «peligroso».
 */
export function sniffMime(bytes: Uint8Array): { mime: string; kind: FileKind } | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return { mime: 'application/pdf', kind: 'pdf' }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return { mime: 'image/png', kind: 'image' }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', kind: 'image' }
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return { mime: 'image/gif', kind: 'image' }
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) {
    return { mime: 'image/tiff', kind: 'image' }
  }
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { mime: 'image/webp', kind: 'image' }
  }
  // RAR5 y RAR4 comparten prefijo y se distinguen por el séptimo byte.
  if (startsWith(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) {
    return { mime: 'application/vnd.rar', kind: 'rar' }
  }
  // Un .docx o .xlsx es un ZIP; se distinguen al abrirlo, no aquí.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) {
    return { mime: 'application/zip', kind: 'zip' }
  }
  // Formato Compound File: los .doc y .xls antiguos.
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return { mime: 'application/x-ole-storage', kind: 'unknown' }
  }
  if (startsWith(bytes, [0x4d, 0x5a])) return { mime: 'application/x-msdownload', kind: 'unknown' }
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return { mime: 'application/x-elf', kind: 'unknown' }
  return null
}

/** Firmas que son ejecutables se bloqueen como se bloqueen. */
function isExecutableSignature(bytes: Uint8Array) {
  return (
    startsWith(bytes, [0x4d, 0x5a]) || // PE/DOS
    startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46]) || // ELF
    startsWith(bytes, [0xcf, 0xfa, 0xed, 0xfe]) || // Mach-O
    startsWith(bytes, [0xfe, 0xed, 0xfa, 0xce])
  )
}

export function inspectFile(input: {
  path: string
  size: number
  declaredMime: string
  head: Uint8Array
}): SafetyVerdict {
  const warnings: string[] = []
  const extension = extensionOf(input.path)

  if (isIgnorableName(input.path)) {
    return {
      ok: false,
      kind: 'unknown',
      detectedMime: null,
      ignorable: true,
      reason: 'Archivo auxiliar del sistema de archivos.',
      warnings,
    }
  }

  if (blockedExtensions.has(extension)) {
    return {
      ok: false,
      kind: 'unknown',
      detectedMime: null,
      ignorable: false,
      reason: 'Tipo de archivo no permitido.',
      warnings,
    }
  }

  if (isExecutableSignature(input.head)) {
    return {
      ok: false,
      kind: 'unknown',
      detectedMime: null,
      ignorable: false,
      // El contenido manda sobre el nombre: un ejecutable renombrado a .pdf
      // sigue siendo un ejecutable.
      reason: 'El contenido del archivo es un ejecutable.',
      warnings,
    }
  }

  if (input.size <= 0) {
    return { ok: false, kind: 'unknown', detectedMime: null, ignorable: false, reason: 'Archivo vacío.', warnings }
  }

  const sniffed = sniffMime(input.head)
  const byExtension = extensionKinds[extension] ?? 'unknown'

  // Un manual escaneado grande cabe en 40 MB; un instrumento completo -manual,
  // cuadernillo, hoja de respuestas, Excel, imágenes- empaquetado en un RAR o
  // un ZIP real no tiene por qué caber ahí, y no hace falta que quepa: nada de
  // lo que hay dentro se confía todavía, así que el tope de 40 MB no puede
  // aplicarse al contenedor sin abrirlo primero. Lo que sí protege el
  // contenido es la extracción misma -`archive-extractor.ts` aplica el tope
  // por archivo extraído, el acumulado del paquete y la relación de
  // compresión- y, antes de eso, el tamaño total de la subida ya se validó en
  // la ruta que la recibe. Aplicar aquí un tope al peso del comprimido en sí
  // rechazaba paquetes reales completos (manual + cuadernillo + hoja +
  // automatizado) por el peso de un solo documento escaneado dentro de ellos.
  const isArchiveContainer = (sniffed?.kind ?? byExtension) === 'zip' || (sniffed?.kind ?? byExtension) === 'rar'

  if (!isArchiveContainer && input.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      kind: 'unknown',
      detectedMime: null,
      ignorable: false,
      reason: `El archivo supera ${Math.round(MAX_FILE_SIZE / (1024 * 1024))} MB.`,
      warnings,
    }
  }

  // Un .xlsx y un .docx son ZIP por dentro: que la firma diga «zip» no es una
  // discrepancia, es como está hecho el formato.
  const zipBackedOffice = sniffed?.kind === 'zip' && (byExtension === 'spreadsheet' || byExtension === 'word')
  const oleOffice = sniffed?.mime === 'application/x-ole-storage' && (byExtension === 'spreadsheet' || byExtension === 'word')

  if (sniffed && !zipBackedOffice && !oleOffice && byExtension !== 'unknown' && sniffed.kind !== byExtension) {
    warnings.push(`La extensión .${extension} no corresponde con el contenido del archivo.`)
  }

  const kind: FileKind = zipBackedOffice || oleOffice ? byExtension : (sniffed?.kind ?? byExtension)

  if (kind === 'unknown') {
    warnings.push('No se reconoció el formato del archivo.')
  }

  return {
    ok: true,
    kind,
    detectedMime: sniffed?.mime ?? (input.declaredMime || null),
    ignorable: false,
    reason: '',
    warnings,
  }
}

/**
 * Normaliza una ruta de dentro de un comprimido y rechaza las que intentan
 * escapar del destino.
 *
 * Un `../../etc/passwd` dentro de un ZIP escribe fuera de la carpeta de
 * extracción si nadie lo mira. Devuelve `null` para toda ruta que no se pueda
 * garantizar contenida.
 */
export function safeArchivePath(rawPath: string): string | null {
  const unified = rawPath.replace(/\\/g, '/')

  // El orden importa: la ruta UNC se comprueba *antes* de quitar las barras
  // iniciales. Al revés, `//servidor/recurso` quedaba como `servidor/recurso`
  // -una ruta relativa de aspecto inocente- y pasaba el filtro.
  if (/^[A-Za-z]:/.test(unified) || unified.startsWith('//')) return null
  if (unified.includes('\0')) return null

  const normalized = unified.replace(/^\/+/, '')
  if (!normalized || normalized.endsWith('/')) return null

  const parts: string[] = []
  for (const segment of normalized.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') return null
    parts.push(segment)
  }

  return parts.length > 0 ? parts.join('/') : null
}

export async function checksumOf(bytes: Uint8Array): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return 'no-disponible'
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
