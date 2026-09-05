import { inflateRawSync } from 'node:zlib'
import {
  MAX_ARCHIVE_DEPTH,
  MAX_COMPRESSION_RATIO,
  MAX_FILE_SIZE,
  MAX_PACKAGE_ENTRIES,
  MAX_PACKAGE_SIZE,
  isIgnorableName,
  safeArchivePath,
} from '@/lib/instruments/import/file-safety'

/**
 * Apertura de paquetes comprimidos, en el servidor y con límites.
 *
 * Extraer un archivo que ha subido otra persona es de las operaciones más
 * hostiles que hace un sistema: una ruta con `..` escribe donde no debe, un
 * archivo de 1 KB puede descomprimirse en 4 GB, y un ZIP puede contener otro
 * ZIP indefinidamente. Nada de eso se detecta después: hay que negarse mientras
 * se lee.
 *
 * Por eso todo pasa por aquí y todo tiene tope: rutas normalizadas y contenidas,
 * cuota total, número de entradas, profundidad de anidamiento y relación máxima
 * de compresión. Lo que excede un límite no aborta el paquete entero; se rechaza
 * esa entrada y se dice por qué.
 */

export type ExtractedEntry = {
  path: string
  bytes: Uint8Array
}

export type ExtractionResult = {
  entries: ExtractedEntry[]
  /** Entradas descartadas y su motivo, para poder explicarlo al profesional. */
  skipped: Array<{ path: string; reason: string }>
  /** `true` cuando se alcanzó un tope y quedó material sin abrir. */
  truncated: boolean
}

export class ArchiveError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'ArchiveError'
  }
}

export interface ArchiveExtractor {
  readonly format: 'zip' | 'rar'
  /** `false` cuando la implementación no está disponible en este despliegue. */
  isAvailable(): Promise<boolean>
  extract(bytes: Uint8Array): Promise<ExtractionResult>
}

// ------------------------------------------------------------------- ZIP

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_OF_CENTRAL = 0x06054b50
const ZIP64_END_LOCATOR = 0x07064b50

function readU16(view: DataView, offset: number) {
  return view.getUint16(offset, true)
}

function readU32(view: DataView, offset: number) {
  return view.getUint32(offset, true)
}

/**
 * Lector de ZIP sobre el directorio central.
 *
 * Se lee el directorio del final y no los encabezados locales del principio:
 * los encabezados locales pueden mentir sobre el tamaño (llevan el descriptor
 * de datos detrás), mientras que el directorio central es el índice real del
 * archivo. Es también lo que permite conocer el tamaño declarado *antes* de
 * descomprimir y así poder negarse a una bomba en lugar de tragársela.
 */
export class ZipExtractor implements ArchiveExtractor {
  readonly format = 'zip' as const

  async isAvailable() {
    return true
  }

  async extract(bytes: Uint8Array): Promise<ExtractionResult> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const endOffset = this.findEndOfCentralDirectory(bytes, view)
    if (endOffset === -1) throw new ArchiveError('El archivo comprimido está incompleto o dañado.')

    if (this.hasZip64Locator(bytes, view, endOffset)) {
      throw new ArchiveError('El archivo comprimido usa un formato ZIP64 que no se puede abrir aquí.')
    }

    const total = readU16(view, endOffset + 10)
    let offset = readU32(view, endOffset + 16)

    const entries: ExtractedEntry[] = []
    const skipped: ExtractionResult['skipped'] = []
    let extractedBytes = 0
    let truncated = false

    for (let index = 0; index < total; index += 1) {
      if (offset + 46 > bytes.length || readU32(view, offset) !== CENTRAL_HEADER) break

      const compressionMethod = readU16(view, offset + 10)
      const compressedSize = readU32(view, offset + 20)
      const uncompressedSize = readU32(view, offset + 24)
      const nameLength = readU16(view, offset + 28)
      const extraLength = readU16(view, offset + 30)
      const commentLength = readU16(view, offset + 32)
      const externalAttributes = readU32(view, offset + 38)
      const localOffset = readU32(view, offset + 42)

      const rawName = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
      offset += 46 + nameLength + extraLength + commentLength

      if (entries.length >= MAX_PACKAGE_ENTRIES) {
        truncated = true
        break
      }

      // Los directorios no son contenido; se saltan sin ruido.
      if (rawName.endsWith('/')) continue

      const safePath = safeArchivePath(rawName)
      if (!safePath) {
        skipped.push({ path: rawName, reason: 'Ruta no permitida dentro del paquete.' })
        continue
      }

      if (isIgnorableName(safePath)) continue

      // Bit 0xA000 de los atributos Unix: enlace simbólico.
      const unixMode = externalAttributes >>> 16
      if ((unixMode & 0xf000) === 0xa000) {
        skipped.push({ path: safePath, reason: 'Los enlaces simbólicos no se extraen.' })
        continue
      }

      if (uncompressedSize > MAX_FILE_SIZE) {
        skipped.push({ path: safePath, reason: 'El archivo supera el tamaño permitido.' })
        continue
      }

      if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) {
        skipped.push({ path: safePath, reason: 'Relación de compresión anómala.' })
        continue
      }

      if (extractedBytes + uncompressedSize > MAX_PACKAGE_SIZE) {
        truncated = true
        break
      }

      try {
        const content = this.readEntry(bytes, view, localOffset, compressionMethod, compressedSize, uncompressedSize)
        entries.push({ path: safePath, bytes: content })
        extractedBytes += content.length
      } catch {
        skipped.push({ path: safePath, reason: 'No se pudo descomprimir el archivo.' })
      }
    }

    return { entries, skipped, truncated }
  }

  private readEntry(
    bytes: Uint8Array,
    view: DataView,
    localOffset: number,
    method: number,
    compressedSize: number,
    uncompressedSize: number,
  ): Uint8Array {
    if (localOffset + 30 > bytes.length || readU32(view, localOffset) !== LOCAL_HEADER) {
      throw new ArchiveError('Encabezado local inválido.')
    }

    const nameLength = readU16(view, localOffset + 26)
    const extraLength = readU16(view, localOffset + 28)
    const start = localOffset + 30 + nameLength + extraLength
    const data = bytes.subarray(start, start + compressedSize)

    if (method === 0) return data.slice(0, uncompressedSize)
    if (method !== 8) throw new ArchiveError(`Método de compresión ${method} no soportado.`)

    const inflated = inflateRawSync(Buffer.from(data), { maxOutputLength: MAX_FILE_SIZE })
    return new Uint8Array(inflated)
  }

  private findEndOfCentralDirectory(bytes: Uint8Array, view: DataView) {
    // El registro final lleva un comentario de longitud variable al final, así
    // que se busca hacia atrás desde el último byte posible.
    const minOffset = Math.max(0, bytes.length - 0xffff - 22)
    for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
      if (readU32(view, offset) === END_OF_CENTRAL) return offset
    }
    return -1
  }

  private hasZip64Locator(bytes: Uint8Array, view: DataView, endOffset: number) {
    const locatorOffset = endOffset - 20
    return locatorOffset >= 0 && readU32(view, locatorOffset) === ZIP64_END_LOCATOR
  }
}

// ------------------------------------------------------------------- RAR

/**
 * Apertura de RAR.
 *
 * El formato es propietario y no hay nada en la biblioteca estándar de Node que
 * lo abra: hace falta una dependencia real (`node-unrar-js`, que trae un WASM
 * capaz de RAR4 y RAR5). Mientras no esté instalada, esta implementación
 * responde que no está disponible en lugar de fallar a mitad de un
 * procesamiento.
 *
 * Ese «no disponible» es una respuesta honesta y llega hasta la pantalla: el
 * paquete se conserva íntegro como respaldo y se dice que su contenido no pudo
 * abrirse, que es muy distinto de perderlo.
 */
export class RarExtractor implements ArchiveExtractor {
  readonly format = 'rar' as const

  async isAvailable() {
    return (await loadUnrar()) !== null
  }

  async extract(bytes: Uint8Array): Promise<ExtractionResult> {
    const unrar = await loadUnrar()
    if (!unrar) {
      throw new ArchiveError(
        'La apertura de archivos RAR no está disponible en este servidor. El paquete se conserva como respaldo.',
      )
    }

    const extractor = await unrar.createExtractorFromData({ data: toArrayBuffer(bytes) })
    const extracted = extractor.extract()

    const entries: ExtractedEntry[] = []
    const skipped: ExtractionResult['skipped'] = []
    let extractedBytes = 0
    let truncated = false

    for (const file of extracted.files) {
      if (entries.length >= MAX_PACKAGE_ENTRIES) {
        truncated = true
        break
      }
      if (file.fileHeader.flags?.directory) continue

      const safePath = safeArchivePath(file.fileHeader.name)
      if (!safePath) {
        skipped.push({ path: file.fileHeader.name, reason: 'Ruta no permitida dentro del paquete.' })
        continue
      }
      if (isIgnorableName(safePath)) continue

      const content = file.extraction
      if (!content) {
        skipped.push({ path: safePath, reason: 'No se pudo descomprimir el archivo.' })
        continue
      }
      if (content.length > MAX_FILE_SIZE) {
        skipped.push({ path: safePath, reason: 'El archivo supera el tamaño permitido.' })
        continue
      }
      if (extractedBytes + content.length > MAX_PACKAGE_SIZE) {
        truncated = true
        break
      }

      entries.push({ path: safePath, bytes: new Uint8Array(content) })
      extractedBytes += content.length
    }

    return { entries, skipped, truncated }
  }
}

type UnrarModule = {
  createExtractorFromData: (options: { data: ArrayBuffer }) => Promise<{
    extract: () => {
      files: Array<{
        fileHeader: { name: string; flags?: { directory?: boolean } }
        extraction?: Uint8Array
      }>
    }
  }>
}

let unrarCache: UnrarModule | null | undefined

async function loadUnrar(): Promise<UnrarModule | null> {
  if (unrarCache !== undefined) return unrarCache
  try {
    // Importación dinámica y opcional: el despliegue que la tenga abre RAR, y
    // el que no, lo dice. La ruta va en una variable para que el empaquetador
    // no intente resolverla en build.
    const moduleName = 'node-unrar-js'
    unrarCache = (await import(/* webpackIgnore: true */ moduleName)) as unknown as UnrarModule
  } catch {
    unrarCache = null
  }
  return unrarCache
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

// --------------------------------------------------------------- fachada

const extractors: ArchiveExtractor[] = [new ZipExtractor(), new RarExtractor()]

export function extractorFor(format: 'zip' | 'rar'): ArchiveExtractor {
  const extractor = extractors.find((item) => item.format === format)
  if (!extractor) throw new ArchiveError(`Formato ${format} no soportado.`)
  return extractor
}

/**
 * Abre un comprimido y, si dentro hay otro, lo abre también hasta el límite de
 * profundidad. Más allá se conserva el archivo tal cual: un anidamiento muy
 * profundo es casi siempre un intento de agotar el servidor, no material.
 */
export async function extractRecursively(
  bytes: Uint8Array,
  format: 'zip' | 'rar',
  depth = 1,
): Promise<ExtractionResult> {
  const result = await extractorFor(format).extract(bytes)
  if (depth >= MAX_ARCHIVE_DEPTH) return result

  const entries: ExtractedEntry[] = []
  const skipped = [...result.skipped]
  let truncated = result.truncated

  for (const entry of result.entries) {
    const nested = nestedFormat(entry)
    if (!nested) {
      entries.push(entry)
      continue
    }

    try {
      const inner = await extractRecursively(entry.bytes, nested, depth + 1)
      for (const innerEntry of inner.entries) {
        entries.push({ path: `${entry.path}/${innerEntry.path}`, bytes: innerEntry.bytes })
      }
      skipped.push(...inner.skipped.map((item) => ({ ...item, path: `${entry.path}/${item.path}` })))
      truncated = truncated || inner.truncated
    } catch {
      // Un comprimido interior que no se puede abrir se conserva como archivo.
      entries.push(entry)
    }
  }

  return { entries, skipped, truncated }
}

function nestedFormat(entry: ExtractedEntry): 'zip' | 'rar' | null {
  const lower = entry.path.toLowerCase()
  // Un .docx o .xlsx también es un ZIP, pero es un documento, no un paquete:
  // abrirlo aquí llenaría el paquete de XML interno del formato.
  if (lower.endsWith('.zip')) return 'zip'
  if (lower.endsWith('.rar')) return 'rar'
  return null
}
