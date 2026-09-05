import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ArchiveError, RarExtractor, ZipExtractor, extractRecursively } from '@/lib/instruments/import/archive-extractor'

/**
 * Construye un ZIP real, byte a byte, para poder probar el lector contra el
 * formato y no contra un doble de la propia implementación.
 */
function buildZip(
  files: Array<{ name: string; content: Buffer; store?: boolean; unixMode?: number; fakeUncompressed?: number }>,
) {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf8')
    const method = file.store ? 0 : 8
    const data = file.store ? file.content : deflateRawSync(file.content)
    const uncompressed = file.fakeUncompressed ?? file.content.length

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(uncompressed, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    locals.push(Buffer.concat([local, nameBytes, data]))

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(0, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(uncompressed, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    // `<< 16` desborda a negativo en los enteros de 32 bits con signo de JS.
    central.writeUInt32LE(((file.unixMode ?? 0o100644) << 16) >>> 0, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(Buffer.concat([central, nameBytes]))

    offset += 30 + nameBytes.length + data.length
  }

  const localBlock = Buffer.concat(locals)
  const centralBlock = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralBlock.length, 12)
  end.writeUInt32LE(localBlock.length, 16)

  return new Uint8Array(Buffer.concat([localBlock, centralBlock, end]))
}

const text = (entry: { bytes: Uint8Array }) => Buffer.from(entry.bytes).toString('utf8')

describe('apertura de ZIP', () => {
  const zip = new ZipExtractor()

  it('está siempre disponible: no depende de nada externo', async () => {
    expect(await zip.isAvailable()).toBe(true)
  })

  it('extrae el material conservando la estructura de carpetas', async () => {
    const archive = buildZip([
      { name: 'MACI/MANUAL MACI.pdf', content: Buffer.from('%PDF-1.4 manual') },
      { name: 'MACI/HOJA DE RESPUESTAS.pdf', content: Buffer.from('%PDF-1.4 respuestas') },
    ])

    const result = await zip.extract(archive)

    expect(result.entries.map((entry) => entry.path)).toEqual([
      'MACI/MANUAL MACI.pdf',
      'MACI/HOJA DE RESPUESTAS.pdf',
    ])
    expect(text(result.entries[0])).toContain('manual')
  })

  it('lee también las entradas guardadas sin comprimir', async () => {
    const result = await zip.extract(buildZip([{ name: 'notas.txt', content: Buffer.from('hola'), store: true }]))
    expect(text(result.entries[0])).toBe('hola')
  })

  it('descarta el escape de directorio en vez de escribir fuera', async () => {
    const result = await zip.extract(
      buildZip([
        { name: '../../fuera.pdf', content: Buffer.from('%PDF-1.4') },
        { name: 'MACI/dentro.pdf', content: Buffer.from('%PDF-1.4') },
      ]),
    )

    expect(result.entries.map((entry) => entry.path)).toEqual(['MACI/dentro.pdf'])
    expect(result.skipped[0]).toMatchObject({ reason: 'Ruta no permitida dentro del paquete.' })
  })

  it('no extrae enlaces simbólicos', async () => {
    const result = await zip.extract(
      buildZip([{ name: 'enlace', content: Buffer.from('/etc/passwd'), unixMode: 0o120777 }]),
    )

    expect(result.entries).toHaveLength(0)
    expect(result.skipped[0].reason).toContain('enlaces simbólicos')
  })

  it('rechaza una entrada con relación de compresión anómala', async () => {
    // Se declara un tamaño descomprimido desmesurado para un dato diminuto:
    // es la firma de una bomba de compresión.
    const result = await zip.extract(
      buildZip([{ name: 'bomba.txt', content: Buffer.from('a'.repeat(64)), fakeUncompressed: 30 * 1024 * 1024 }]),
    )

    expect(result.entries).toHaveLength(0)
    expect(result.skipped[0].reason).toContain('compresión anómala')
  })

  it('ignora el ruido del sistema sin contarlo como material', async () => {
    const result = await zip.extract(
      buildZip([
        { name: 'MACI/Thumbs.db', content: Buffer.from('x') },
        { name: '__MACOSX/._MANUAL.pdf', content: Buffer.from('x') },
        { name: 'MACI/MANUAL.pdf', content: Buffer.from('%PDF-1.4') },
      ]),
    )

    expect(result.entries.map((entry) => entry.path)).toEqual(['MACI/MANUAL.pdf'])
    expect(result.skipped).toHaveLength(0)
  })

  it('falla con un mensaje legible si el archivo está dañado', async () => {
    await expect(zip.extract(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(ArchiveError)
  })
})

describe('anidamiento', () => {
  it('abre un comprimido dentro de otro y prefija la ruta', async () => {
    const inner = buildZip([{ name: 'MANUAL.pdf', content: Buffer.from('%PDF-1.4 interior') }])
    const outer = buildZip([{ name: 'paquete/MACI.zip', content: Buffer.from(inner) }])

    const result = await extractRecursively(outer, 'zip')

    expect(result.entries.map((entry) => entry.path)).toEqual(['paquete/MACI.zip/MANUAL.pdf'])
  })

  it('deja de abrir al llegar al límite de profundidad y conserva el archivo', async () => {
    const level3 = buildZip([{ name: 'hondo.pdf', content: Buffer.from('%PDF') }])
    const level2 = buildZip([{ name: 'nivel3.zip', content: Buffer.from(level3) }])
    const level1 = buildZip([{ name: 'nivel2.zip', content: Buffer.from(level2) }])

    const result = await extractRecursively(level1, 'zip')

    // El tercer nivel no se abre: se conserva el comprimido tal cual.
    expect(result.entries.map((entry) => entry.path)).toEqual(['nivel2.zip/nivel3.zip'])
  })

  it('no confunde un documento ofimático con un paquete comprimido', async () => {
    const docx = buildZip([{ name: 'word/document.xml', content: Buffer.from('<w:p/>') }])
    const outer = buildZip([{ name: 'MACI/informe.docx', content: Buffer.from(docx) }])

    const result = await extractRecursively(outer, 'zip')

    expect(result.entries.map((entry) => entry.path)).toEqual(['MACI/informe.docx'])
  })
})

describe('apertura de RAR', () => {
  it('declara su disponibilidad en lugar de fallar a mitad del procesamiento', async () => {
    const rar = new RarExtractor()
    const available = await rar.isAvailable()

    expect(typeof available).toBe('boolean')
    if (!available) {
      await expect(rar.extract(new Uint8Array([0x52, 0x61, 0x72, 0x21]))).rejects.toThrow(/no está disponible/)
    }
  })
})
