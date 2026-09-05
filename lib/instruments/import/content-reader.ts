import { ZipExtractor } from '@/lib/instruments/import/archive-extractor'
import * as XLSX from 'xlsx'

export type ReadableSource = {
  fileId: string
  fileName: string
  path: string
  bytes: Uint8Array
}

export type TextDocument = {
  text: string
  locations: string[]
}

export async function readSourceText(source: ReadableSource): Promise<TextDocument> {
  const name = source.fileName || source.path
  if (/\.(xlsx|xls|csv)$/i.test(name)) return readSpreadsheetText(source.bytes, name)
  if (/\.docx$/i.test(name)) return readDocxText(source.bytes)
  if (/\.(json|txt)$/i.test(name)) return { text: decodeText(source.bytes), locations: ['archivo'] }
  if (/\.pdf$/i.test(name)) return { text: decodeText(source.bytes), locations: ['texto embebido'] }
  return { text: decodeText(source.bytes), locations: ['archivo'] }
}

export function readSpreadsheetText(bytes: Uint8Array, fileName: string): TextDocument {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(Buffer.from(bytes), {
      type: 'buffer',
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
    })
  } catch {
    return { text: decodeText(bytes), locations: [fileName] }
  }
  const lines: string[] = []
  const locations: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    locations.push(`Hoja ${sheetName}`)
    const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(sheet, {
      header: 1,
      raw: false,
      blankrows: false,
      defval: '',
    })
    rows.forEach((row, rowIndex) => {
      const values = row.map((cell) => String(cell ?? '').trim()).filter(Boolean)
      if (values.length > 0) lines.push(`[${sheetName}!${rowIndex + 1}] ${values.join(' | ')}`)
    })
  }
  return { text: lines.join('\n'), locations: locations.length ? locations : [fileName] }
}

export async function readDocxText(bytes: Uint8Array): Promise<TextDocument> {
  try {
    const archive = await new ZipExtractor().extract(bytes)
    const documentXml = archive.entries.find((entry) => entry.path.toLowerCase() === 'word/document.xml')
    if (!documentXml) return { text: decodeText(bytes), locations: ['documento'] }
    const xml = decodeText(documentXml.bytes)
    const text = xml
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
    return { text, locations: ['word/document.xml'] }
  } catch {
    return { text: decodeText(bytes), locations: ['documento'] }
  }
}

export function decodeText(bytes: Uint8Array) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}
