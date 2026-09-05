import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { runImportPipeline, type IncomingFile } from '@/lib/instruments/import/import-pipeline'
import { resolveIdentity, acronymOf } from '@/lib/instruments/import/identity-resolver'
import { classifyFile } from '@/lib/instruments/import/file-classifier'
import { analyzeSpreadsheet } from '@/lib/instruments/import/spreadsheet-analyzer'

/** ZIP mínimo pero real, para probar el paquete completo de principio a fin. */
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
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38)
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

const pdf = (label: string) => Buffer.from(`%PDF-1.4\n% ${label}\n`)

const file = (path: string, bytes: Buffer | Uint8Array, mime = ''): IncomingFile => ({
  path,
  declaredMime: mime,
  bytes: bytes instanceof Buffer ? new Uint8Array(bytes) : bytes,
})

const run = (files: IncomingFile[]) =>
  runImportPipeline({ evaluationId: 'eval-1', createdBy: 'prof-1', files })

function buildXls() {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Item 1', 1],
    ['Item 2', 2],
    ['Total', { f: 'SUM(B1:B2)' }],
  ])
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Correccion')
  return new Uint8Array(XLSX.write(workbook, { bookType: 'xls', type: 'buffer' }) as Buffer)
}

function buildResultXls() {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Resultado final', 42],
    ['Percentil', 80],
    ['Clasificación', 'Alto'],
  ])
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultados')
  return new Uint8Array(XLSX.write(workbook, { bookType: 'xls', type: 'buffer' }) as Buffer)
}

describe('paquete repartido en varios archivos', () => {
  it('reconoce cada material de un paquete tipo manual + cuadernillo + respuestas + hoja', async () => {
    const { pkg } = await run([
      file('MANUAL MACI.pdf', pdf('manual')),
      file('CUADERNILLO MACI.pdf', pdf('cuadernillo')),
      file('HOJA DE RESPUESTAS MACI.pdf', pdf('respuestas')),
      file('MACI.xlsx', buildZip([{ name: 'xl/workbook.xml', content: Buffer.from('<sheet name="Datos"/>') }])),
    ])

    const roles = Object.fromEntries(pkg.files.map((item) => [item.name, item.role]))
    expect(roles['MANUAL MACI.pdf']).toBe('MANUAL')
    expect(roles['CUADERNILLO MACI.pdf']).toBe('QUESTION_BOOKLET')
    expect(roles['HOJA DE RESPUESTAS MACI.pdf']).toBe('ANSWER_SHEET')
    expect(roles['MACI.xlsx']).toBe('AUTOMATED_SPREADSHEET')
  })

  it('toma el nombre del instrumento del material, no del archivo suelto', async () => {
    const { pkg } = await run([file('MANUAL MACI.pdf', pdf('manual'))])
    expect(pkg.name).toBe('MACI')
  })

  it('identifica STAI desde descriptores clinicos sin usar ESTADO como nombre', async () => {
    const { pkg } = await run([file('manual cuestionario de ansiedad estado.pdf', pdf('manual stai'))])

    expect(pkg.name).toBe('STAI')
    expect(pkg.fingerprint.acronym).toBe('STAI')
    expect(pkg.fingerprint.normalizedName).toBe('stai')
  })

  it('abre un ZIP y conserva la estructura de carpetas', async () => {
    const archive = buildZip([
      { name: 'MACI/MANUAL MACI.pdf', content: pdf('manual') },
      { name: 'MACI/HOJA DE RESPUESTAS.pdf', content: pdf('respuestas') },
    ])

    const { pkg } = await run([file('MACI.zip', archive, 'application/zip')])

    expect(pkg.files.filter((item) => item.status === 'ACCEPTED')).toHaveLength(2)
    expect(pkg.files.every((item) => item.extractedFrom !== null)).toBe(true)
    expect(pkg.files.map((item) => item.path)).toContain('MACI.zip/MACI/MANUAL MACI.pdf')
  })

  it('descarta el ejecutable de un paquete sin tirar el resto del material', async () => {
    const archive = buildZip([
      { name: 'MACI/MANUAL.pdf', content: pdf('manual') },
      { name: 'MACI/setup.exe', content: Buffer.from([0x4d, 0x5a, 0x90, 0x00]) },
    ])

    const { pkg, notices } = await run([file('MACI.zip', archive, 'application/zip')])

    expect(pkg.files.filter((item) => item.status === 'ACCEPTED')).toHaveLength(1)
    expect(pkg.files.find((item) => item.name === 'setup.exe')?.status).toBe('REJECTED')
    expect(notices.join(' ')).toContain('no permitido')
  })

  it('ignora el ruido del sistema sin avisar de nada al profesional', async () => {
    const archive = buildZip([
      { name: 'MACI/MANUAL.pdf', content: pdf('manual') },
      { name: 'MACI/Thumbs.db', content: Buffer.from('x') },
      { name: 'MACI/.picasa.ini', content: Buffer.from('x') },
    ])

    const { pkg, notices } = await run([file('MACI.zip', archive, 'application/zip')])

    expect(pkg.files.filter((item) => item.status === 'ACCEPTED')).toHaveLength(1)
    expect(notices).toEqual([])
  })

  it('declara el paquete como sólo respaldo cuando nada es material de aplicación', async () => {
    const { pkg } = await run([file('foto.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))])
    expect(pkg.readiness).toBe('SUPPORT_MATERIAL_ONLY')
  })

  it('nunca da un paquete por listo sin revisión', async () => {
    const { pkg } = await run([
      file('MANUAL MACI.pdf', pdf('manual')),
      file('CUADERNILLO MACI.pdf', pdf('cuadernillo')),
      file('HOJA DE RESPUESTAS MACI.pdf', pdf('respuestas')),
    ])

    expect(pkg.readiness).not.toBe('READY')
    expect(pkg.blocks.every((block) => block.approved === false)).toBe(true)
  })

  it('se detiene con un motivo legible si no queda nada procesable', async () => {
    const { pkg } = await run([file('virus.exe', Buffer.from([0x4d, 0x5a, 0x90, 0x00]))])

    expect(pkg.readiness).toBe('FAILED')
    expect(pkg.errorMessage).toContain('Ningún archivo')
  })

  it('deja constancia de la procedencia de cada material', async () => {
    const { pkg } = await run([file('MANUAL MACI.pdf', pdf('manual'))])
    const manual = pkg.files[0]

    expect(manual.checksum).toMatch(/^[0-9a-f]{64}$/)
    expect(manual.evidence.length).toBeGreaterThan(0)
    expect(manual.confidence).toBeGreaterThan(0)
  })
})

describe('bloques de revisión', () => {
  it('marca como ausente lo que el material no aporta', async () => {
    const { pkg } = await run([file('MANUAL MACI.pdf', pdf('manual'))])

    const byId = Object.fromEntries(pkg.blocks.map((block) => [block.id, block]))
    expect(byId.respuestas.state).toBe('MISSING')
    expect(byId.respuestas.notes.join(' ')).toContain('Sin hoja de respuestas')
    expect(byId.calculo.state).toBe('MISSING')
  })

  it('no da por buenas las reglas de cálculo aunque exista la hoja', async () => {
    const { pkg } = await run([
      file('MANUAL MACI.pdf', pdf('manual')),
      file('MACI.xlsx', buildZip([{ name: 'xl/workbook.xml', content: Buffer.from('<sheet name="Calculo"/>') }])),
    ])

    const calculo = pkg.blocks.find((block) => block.id === 'calculo')!
    expect(calculo.state).toBe('REVIEW')
    expect(calculo.notes.join(' ')).toContain('requieren validación')
  })
})

describe('hojas de calculo antiguas', () => {
  it('lee un .xls y reconoce sus hojas y celdas', async () => {
    const analysis = await analyzeSpreadsheet(buildXls(), 'SOFTWARE.xls')

    expect(analysis.readable).toBe(true)
    expect(analysis.sheets.map((sheet) => sheet.name)).toContain('Correccion')
    expect(analysis.sheets.find((sheet) => sheet.name === 'Correccion')?.valueCells).toBeGreaterThan(0)
  })

  it('mantiene el .xls extraido como material de calculo del paquete', async () => {
    const archive = buildZip([
      { name: 'BENDER/MANUAL BENDER.pdf', content: pdf('manual') },
      { name: 'BENDER/SOFTWARE.xls', content: Buffer.from(buildXls()) },
    ])

    const { pkg } = await run([file('BENDER.zip', archive, 'application/zip')])
    const spreadsheet = pkg.files.find((item) => item.name === 'SOFTWARE.xls')

    expect(spreadsheet?.role).toBe('AUTOMATED_SPREADSHEET')
    expect(pkg.blocks.find((block) => block.id === 'calculo')?.state).toBe('REVIEW')
  })

  it('importa resultados ya calculados desde una hoja de cálculo', async () => {
    const { pkg } = await run([
      file('Manual STAI.pdf', pdf('manual stai')),
      file('Resultados STAI.xls', buildResultXls()),
    ])

    expect(pkg.computedResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Resultado final', rawValue: '42', sourceFile: 'Resultados STAI.xls' }),
        expect.objectContaining({ label: 'Percentil', percentile: 80, sourceFile: 'Resultados STAI.xls' }),
        expect.objectContaining({ label: 'Clasificación', classification: 'Alto', sourceFile: 'Resultados STAI.xls' }),
      ]),
    )
    expect(pkg.readiness).toBe('PARTIAL_READY')
  })

  it('persiste diagnostico y capacidades de una aplicacion XLSX contestada', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['item', 'respuesta'],
        [1, 3],
        [2, 4],
        [3, 2],
        [4, 1],
      ]),
      'STAI Estado',
    )
    const { pkg } = await run([
      file('Manual STAI.pdf', pdf('manual stai')),
      file('hoja respuestas stai.xlsx', new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer)),
    ])

    expect(pkg.diagnostics).toMatchObject({
      pipelineVersion: 'instrument-ai-v3',
      workbooksFound: 1,
      workbooksInspected: 1,
      completedApplicationCandidates: 1,
      validatedResponses: 4,
      capabilities: expect.objectContaining({
        hasApplication: true,
        canExtractResponses: true,
        canShowResults: true,
        canExportToStep7: true,
      }),
    })
    expect(pkg.diagnostics?.workbookAnalyses[0]).toMatchObject({
      semanticKind: 'COMPLETED_APPLICATION',
      sheetsInspected: 1,
    })
  })

  it('procesa una aplicacion XLSX de un instrumento no catalogado sin reglas por nombre', async () => {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase()
    const instrumentName = `Escala Experimental ${suffix}`
    const rows: unknown[][] = [
      ['Instrumento', instrumentName],
      ['Evaluado', 'Caso ciego'],
      ['item', 'respuesta'],
    ]
    for (let item = 1; item <= 12; item += 1) {
      rows.push([item, (item % 4) + 1])
    }

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Aplicacion')
    const { pkg } = await run([
      file(`manual ${instrumentName}.pdf`, pdf(`${instrumentName} manual 12 items`)),
      file(`protocolo ${suffix}.xlsx`, new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer)),
    ])

    expect(pkg.name).not.toBe('STAI')
    expect(pkg.name).not.toBe('MACI')
    expect(pkg.name).not.toBe('ENFEN')
    expect(pkg.responseCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'COMPLETED_RESPONSE',
          responseCount: 12,
        }),
      ]),
    )
    expect(pkg.extractedResponses[0]).toMatchObject({
      totalItemsExpected: 12,
      totalItemsExtracted: 12,
      completionRate: 1,
    })
    expect(pkg.computedResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Puntuación directa extraída',
          rawValue: '30',
        }),
      ]),
    )
    expect(pkg.diagnostics?.capabilities).toMatchObject({
      hasApplication: true,
      canExtractResponses: true,
      canShowResults: true,
      canGenerateCharts: true,
      canExportToStep7: true,
    })
  })

  it('clasifica un paquete Bender con laminas, protocolos y software', async () => {
    const archive = buildZip([
      { name: 'BENDER/LAMINA 8.doc', content: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) },
      { name: 'BENDER/PROTOCOLOS.doc', content: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) },
      { name: 'BENDER/SOFTWARE.xls', content: Buffer.from(buildXls()) },
    ])

    const { pkg } = await run([file('914. BENDER + SOFTWARE.zip', archive, 'application/zip')])
    const roles = Object.fromEntries(pkg.files.map((item) => [item.name, item.role]))

    expect(roles['LAMINA 8.doc']).toBe('QUESTION_BOOKLET')
    expect(roles['PROTOCOLOS.doc']).toBe('ANSWER_SHEET')
    expect(roles['SOFTWARE.xls']).toBe('AUTOMATED_SPREADSHEET')
  })
})

describe('identidad del instrumento', () => {
  it('extrae el acrónimo del nombre del material', () => {
    expect(acronymOf('MANUAL MACI.pdf')).toBe('MACI')
    expect(acronymOf('HOJA DE RESPUESTAS WISC-V.pdf')).toBe('WISC-V')
    expect(acronymOf('manual cuestionario de ansiedad estado.doc')).toBe('STAI')
    expect(acronymOf('ESTADO.doc')).toBeNull()
    expect(acronymOf('documento sin siglas.pdf')).toBeNull()
  })

  it('reconoce el mismo material subido dos veces', async () => {
    const { pkg } = await run([file('MANUAL MACI.pdf', pdf('manual'))])
    const match = resolveIdentity(pkg.fingerprint, [pkg])

    expect(match.kind).toBe('DUPLICATE')
  })

  it('propone añadir material nuevo al instrumento ya incorporado', async () => {
    const { pkg: primero } = await run([file('MANUAL MACI.pdf', pdf('manual maci'))])
    const { pkg: segundo } = await run([file('HOJA DE RESPUESTAS MACI.pdf', pdf('respuestas maci'))])

    const match = resolveIdentity(segundo.fingerprint, [primero])
    expect(match.kind).toBe('SAME_INSTRUMENT')
  })

  it('no fusiona instrumentos distintos', async () => {
    const { pkg: maci } = await run([file('MANUAL MACI.pdf', pdf('manual maci'))])
    const { pkg: wisc } = await run([file('MANUAL WISC.pdf', pdf('manual wisc'))])

    expect(resolveIdentity(wisc.fingerprint, [maci]).kind).toBe('NEW')
  })
})

describe('clasificación', () => {
  it('no rechaza lo que no reconoce: lo deja sin clasificar', () => {
    expect(classifyFile({ path: 'anexo.xyz', kind: 'unknown', size: 100 })).toMatchObject({ role: 'UNKNOWN' })
  })

  it('usa el contenido cuando el nombre no dice nada', () => {
    const result = classifyFile({
      path: 'Documento1.pdf',
      kind: 'pdf',
      size: 1000,
      text: 'Ficha tecnica. Poblacion. Administracion. Interpretacion. Validez.',
    })

    expect(result.role).toBe('MANUAL')
    expect(result.evidence.join(' ')).toContain('Contenido')
  })
})
