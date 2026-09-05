import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { extractResponses, extractResponsesFromText, normalizeResponseValue } from '@/lib/instruments/import/response-extraction-engine'
import type { CompletedResponseCandidate, PackageFile } from '@/lib/instruments/import/package-model'

describe('response extraction engine', () => {
  it('extrae respuestas numeradas verticales', () => {
    const responses = extractResponsesFromText('1 -> 3\n2 -> 4\n3 -> 1', 'respuestas.txt')
    expect(responses).toEqual([
      expect.objectContaining({ itemId: '1', normalizedValue: '3', status: 'EXTRACTED' }),
      expect.objectContaining({ itemId: '2', normalizedValue: '4', status: 'EXTRACTED' }),
      expect.objectContaining({ itemId: '3', normalizedValue: '1', status: 'EXTRACTED' }),
    ])
  })

  it('extrae respuestas tipo item y letras', () => {
    const responses = extractResponsesFromText('Item 1: A\nItem 2: B')
    expect(responses.map((item) => item.normalizedValue)).toEqual(['A', 'B'])
  })

  it('normaliza opciones verbales sin inventar valores desconocidos', () => {
    expect(normalizeResponseValue('Siempre')).toBe('4')
    expect(normalizeResponseValue('Casi siempre')).toBe('3')
    expect(normalizeResponseValue('No existe')).toBe('')
  })

  it('extrae respuestas desde DOCX usando el motor completo', async () => {
    const file = packageFile('protocolo.docx')
    const set = await extractResponses({
      blueprint: null,
      candidate: candidate(file.id),
      files: [file],
      sources: [{ fileId: file.id, fileName: file.name, path: file.path, bytes: docxBytes('Item 1: A\nItem 2: B') }],
    })

    expect(set.sourceFiles).toEqual(['protocolo.docx'])
    expect(set.responses.map((response) => response.normalizedValue)).toEqual(['A', 'B'])
  })

  it('extrae respuestas desde PDF con texto embebido usando el motor completo', async () => {
    const file = packageFile('protocolo.pdf')
    const set = await extractResponses({
      blueprint: null,
      candidate: candidate(file.id),
      files: [file],
      sources: [{ fileId: file.id, fileName: file.name, path: file.path, bytes: Buffer.from('%PDF\nItem 1: 1\nItem 2: 2') }],
    })

    expect(set.responses.map((response) => response.normalizedValue)).toEqual(['1', '2'])
  })
})

function packageFile(name: string): PackageFile {
  return {
    id: name,
    path: name,
    name,
    extension: name.slice(name.lastIndexOf('.')),
    declaredMime: '',
    detectedMime: null,
    size: 100,
    checksum: name,
    role: 'ANSWER_SHEET',
    confidence: 0.9,
    evidence: [],
    status: 'ACCEPTED',
    reason: '',
    extractedFrom: null,
  }
}

function candidate(fileId: string): CompletedResponseCandidate {
  return {
    fileId,
    instrumentId: 'GEN',
    status: 'COMPLETED_RESPONSE',
    responseCount: 2,
    completeness: 1,
    confidence: 0.9,
    evidence: [],
  }
}

function docxBytes(text: string) {
  const xml = `<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`
  const name = Buffer.from('word/document.xml', 'utf8')
  const content = Buffer.from(xml)
  const data = deflateRawSync(content)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(8, 8)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(content.length, 22)
  local.writeUInt16LE(name.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(content.length, 24)
  central.writeUInt16LE(name.length, 28)
  central.writeUInt32LE(0, 42)
  const localBlock = Buffer.concat([local, name, data])
  const centralBlock = Buffer.concat([central, name])
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(centralBlock.length, 12)
  end.writeUInt32LE(localBlock.length, 16)
  return new Uint8Array(Buffer.concat([localBlock, centralBlock, end]))
}
