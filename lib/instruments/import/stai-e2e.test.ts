import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { runImportPipeline } from '@/lib/instruments/import/import-pipeline'

describe('STAI E2E fixture', () => {
  it('identifica STAI, extrae respuestas, crea resultado directo y deja bundle parcial listo', async () => {
    const responseWorkbook = workbookBytes([
      ['item', 'respuesta'],
      [1, 3],
      [2, 4],
      [3, 1],
    ])
    const zip = buildZip([
      { name: 'STAI/manual stai.pdf', content: Buffer.from('%PDF-1.4\nInventario de Ansiedad Estado-Rasgo STAI manual') },
      { name: 'STAI/hoja respuestas stai.xlsx', content: Buffer.from(responseWorkbook) },
      { name: 'STAI/baremos stai.pdf', content: Buffer.from('%PDF-1.4\nbaremos STAI percentil') },
    ])

    const { pkg, blueprint } = await runImportPipeline({
      evaluationId: 'eval-test',
      createdBy: 'prof',
      files: [{ path: 'STAI.zip', declaredMime: 'application/zip', bytes: zip }],
    })

    expect(pkg.fingerprint.acronym).toBe('STAI')
    expect(blueprint?.shortName).toBe('STAI')
    expect(pkg.responseCandidates.some((candidate) => candidate.status === 'COMPLETED_RESPONSE')).toBe(true)
    expect(pkg.extractedResponses[0].responses).toHaveLength(3)
    expect(pkg.computedResults).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Puntuación directa extraída', rawValue: '8' })]),
    )
    expect(pkg.readiness).toBe('PARTIAL_READY')
  })
})

function workbookBytes(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'STAI Estado')
  return new Uint8Array(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}

function buildZip(files: Array<{ name: string; content: Buffer }>) {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf8')
    const data = deflateRawSync(file.content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(file.content.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    locals.push(Buffer.concat([local, nameBytes, data]))
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(file.content.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
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
