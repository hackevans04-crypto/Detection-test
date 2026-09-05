import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { detectCompletedResponses } from '@/lib/instruments/import/completed-response-detector'
import type { PackageFile, PackageFileRole } from '@/lib/instruments/import/package-model'

describe('completed response detector', () => {
  it('detecta una hoja XLSX contestada', async () => {
    const bytes = workbookBytes([
      ['item', 'respuesta'],
      [1, 3],
      [2, 4],
      [3, 1],
    ])
    const file = packageFile('respuestas.xlsx', 'ANSWER_SHEET')
    const candidates = await detectCompletedResponses({
      files: [file],
      sources: [{ fileId: file.id, fileName: file.name, path: file.path, bytes }],
      instrumentId: 'STAI',
    })

    expect(candidates[0]).toMatchObject({
      status: 'COMPLETED_RESPONSE',
      responseCount: 3,
      instrumentId: 'STAI',
    })
  })

  it('no confunde un XLSX blanco con aplicación contestada', async () => {
    const bytes = workbookBytes([
      ['Nombre', 'Fecha'],
      ['Item', 'Respuesta'],
    ])
    const file = packageFile('hoja-blanca.xlsx', 'ANSWER_SHEET')
    const candidates = await detectCompletedResponses({
      files: [file],
      sources: [{ fileId: file.id, fileName: file.name, path: file.path, bytes }],
      instrumentId: 'STAI',
    })

    expect(candidates[0].status).toBe('BLANK_FORM')
    expect(candidates[0].responseCount).toBe(0)
  })

  it('no confunde una hoja de calculo con formulas vacias con una aplicacion', async () => {
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Item', 'Respuesta', 'Total'],
      [1, null, { f: 'SUM(B2:B41)' }],
      [2, null],
      [3, null],
    ])
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Correccion')
    const bytes = new Uint8Array(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
    const file = packageFile('STAI correccion automatizada.xlsx', 'AUTOMATED_SPREADSHEET')
    const candidates = await detectCompletedResponses({
      files: [file],
      sources: [{ fileId: file.id, fileName: file.name, path: file.path, bytes }],
      instrumentId: 'STAI',
    })

    expect(candidates[0].status).toBe('SCORING_TEMPLATE')
    expect(candidates[0].responseCount).toBe(0)
    expect(candidates[0].evidence.join(' ')).toContain('fórmula')
  })

  it('detecta respuestas en DOCX con texto embebido', async () => {
    const bytes = docxBytes('Item 1: A\nItem 2: B\nItem 3: C')
    const file = packageFile('protocolo.docx', 'ANSWER_SHEET')
    const candidates = await detectCompletedResponses({
      files: [file],
      sources: [{ fileId: file.id, fileName: file.name, path: file.path, bytes }],
      instrumentId: 'GEN',
    })

    expect(candidates[0].status).toBe('COMPLETED_RESPONSE')
    expect(candidates[0].responseCount).toBe(3)
  })

  it('detecta respuestas desde PDF con texto extraíble', async () => {
    const bytes = Buffer.from('%PDF-1.4\nItem 1: 1\nItem 2: 2\nItem 3: 3\n')
    const file = packageFile('protocolo.pdf', 'ANSWER_SHEET')
    const candidates = await detectCompletedResponses({
      files: [file],
      sources: [{ fileId: file.id, fileName: file.name, path: file.path, bytes }],
      instrumentId: 'GEN',
    })

    expect(candidates[0].status).toBe('COMPLETED_RESPONSE')
    expect(candidates[0].responseCount).toBe(3)
  })
})

function workbookBytes(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Respuestas')
  return new Uint8Array(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}

function packageFile(name: string, role: PackageFileRole): PackageFile {
  return {
    id: name,
    path: name,
    name,
    extension: name.slice(name.lastIndexOf('.')),
    declaredMime: '',
    detectedMime: null,
    size: 100,
    checksum: name,
    role,
    confidence: 0.9,
    evidence: [],
    status: 'ACCEPTED',
    reason: '',
    extractedFrom: null,
  }
}

function docxBytes(text: string) {
  const xml = `<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`
  return buildZip([{ name: 'word/document.xml', content: Buffer.from(xml) }])
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
