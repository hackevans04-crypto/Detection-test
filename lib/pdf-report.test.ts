import { describe, expect, it } from 'vitest'
import { makeEvaluation } from '@/lib/evaluations/test-factory'
import { buildReport } from '@/lib/evaluations/report'
import { generatePsychopedagogicalReport } from '@/lib/pdf-report'
import { createEvaluationInstrument, type TextEntry } from '@/lib/evaluations/model'
import { createInstrumentPackage } from '@/lib/instruments/import/package-model'

function accepted(text: string): TextEntry {
  return { id: text.slice(0, 12), text, createdAt: '2026-09-02T00:00:00.000Z', status: 'ACCEPTED' }
}

/**
 * El PDF se escribe a mano, byte a byte (ver docstring de pdf-report.ts): un
 * offset mal calculado, un NaN colado en una coordenada o un paréntesis sin
 * escapar corrompen el archivo en silencio, sin que TypeScript lo note. Esta
 * prueba genera un informe con dona de áreas y recomendaciones por
 * destinatario, y valida que el PDF resultante sea binariamente consistente.
 */
describe('generatePsychopedagogicalReport', () => {
  it('produces a structurally valid PDF with a real donut, a KPI grid and recommendation callouts', async () => {
    const entry = createEvaluationInstrument({
      instrumentId: 'pkg-stai',
      name: 'STAI',
      order: 1,
      applicationMode: 'IMPORTED',
      professionalId: 'prof',
      professionalName: 'Profesional',
    })
    const pkg = createInstrumentPackage({ evaluationId: 'eval-test', createdBy: 'prof' })
    pkg.id = 'pkg-stai'
    pkg.name = 'STAI'
    pkg.computedResults = [
      { measureId: 'estado', label: 'Ansiedad estado', rawValue: '38', transformedValue: null, percentile: 65, classification: 'Medio', sourceFile: 'STAI.xlsx', sourceLocation: 'Resultados!B2', confidence: 0.87 },
      { measureId: 'rasgo', label: 'Ansiedad rasgo', rawValue: '44', transformedValue: null, percentile: 78, classification: 'Alto', sourceFile: 'STAI.xlsx', sourceLocation: 'Resultados!C2', confidence: 0.83 },
    ]

    const evaluation = makeEvaluation({
      battery: [entry],
      instrumentPackages: [pkg],
      functionalAreas: {
        'conocimiento-corporal': { description: '', performance: 'En desarrollo', observations: 'x', fields: {} },
        'dominancia-lateral': { description: '', performance: 'Dificultad marcada', observations: 'x', fields: {} },
        orientacion: { description: '', performance: 'Adecuado', observations: 'x', fields: {} },
        'motricidad-gruesa': { description: '', performance: 'En desarrollo', observations: 'x', fields: {} },
        'motricidad-fina': { description: '', performance: 'En desarrollo', observations: 'x', fields: {} },
        'habilidades-psicolinguisticas': { description: '', performance: 'En desarrollo', observations: 'x', fields: {} },
      },
      conclusions: [accepted('Sintesis de prueba para verificar el informe.')],
      recommendations: {
        docentes: [accepted('Ajustar actividades de aula.')],
        'pedagogo-apoyo': [accepted('Planificar acompanamiento psicopedagogico.')],
        dece: [accepted('Mantener seguimiento institucional.')],
        'representante-legal': [accepted('Acompanar rutinas de estudio en casa.')],
        psicopedagogo: [accepted('Registrar trazabilidad de la intervencion.')],
      },
    })

    const document = buildReport(evaluation)
    const areaSection = document.sections.find((section) => section.number === 4)
    expect(areaSection?.blocks.some((block) => block.kind === 'chart' && block.type === 'donut')).toBe(true)

    const recommendationsSection = document.sections.find((section) => section.number === 9)
    expect(recommendationsSection?.blocks).toHaveLength(5)
    expect(recommendationsSection?.blocks.every((block) => block.kind === 'note')).toBe(true)

    const resultsSection = document.sections.find((section) => section.number === 6)
    const kpiBlocks = resultsSection?.blocks.filter((block) => block.kind === 'kpi-grid') ?? []
    // El primero es el resumen del expediente completo (8 KPIs ejecutivos).
    expect(kpiBlocks[0]?.kind).toBe('kpi-grid')
    if (kpiBlocks[0]?.kind === 'kpi-grid') {
      expect(kpiBlocks[0].items).toHaveLength(8)
      const quality = kpiBlocks[0].items.find((item) => item.label === 'Calidad del dato')
      expect(quality?.value).toBe('85%')
      expect(quality?.detail).toContain('Confianza 85%')
    }
    // El segundo es el KPI propio de STAI, no un resumen recalculado.
    expect(kpiBlocks[1]?.kind).toBe('kpi-grid')
    if (kpiBlocks[1]?.kind === 'kpi-grid') {
      expect(kpiBlocks[1].items).toEqual([
        { label: 'Materiales analizados', value: '0' }, // este fixture no adjunta archivos
        { label: 'Fuentes', value: '0' },
        { label: 'Confianza de extracción', value: '85%' },
        { label: 'Cobertura', value: 'No disponible' }, // STAI no declara ítems esperados en este fixture
      ])
    }

    const blob = generatePsychopedagogicalReport(document, {})
    expect(blob.type).toBe('application/pdf')

    const bytes = new Uint8Array(await blob.arrayBuffer())
    let raw = ''
    for (let index = 0; index < bytes.length; index += 1) raw += String.fromCharCode(bytes[index])

    expect(raw.startsWith('%PDF-1.4')).toBe(true)
    expect(raw.trim().endsWith('%%EOF')).toBe(true)
    expect(raw).not.toContain('NaN')
    expect(raw).not.toContain('undefined')

    // Cada offset del xref debe caer exactamente sobre su "N 0 obj".
    const xrefMatch = raw.match(/xref\n0 (\d+)\n([\s\S]+?)trailer/)
    expect(xrefMatch).not.toBeNull()
    const entries = xrefMatch![2].trim().split('\n').slice(1) // salta la entrada 0 libre
    entries.forEach((line, index) => {
      const offset = Number(line.slice(0, 10))
      const objectNumber = index + 1
      expect(raw.slice(offset, offset + `${objectNumber} 0 obj`.length)).toBe(`${objectNumber} 0 obj`)
    })
  })

  it('places the institutional crest above separated system and developer logos', async () => {
    const document = buildReport(makeEvaluation())

    const assets = {
      university: { width: 170, height: 220, bytes: new Uint8Array([0]) },
      system: { width: 600, height: 220, bytes: new Uint8Array([0]) },
      developer: { width: 2172, height: 724, bytes: new Uint8Array([0]) },
    }

    const blob = generatePsychopedagogicalReport(document, assets)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let raw = ''
    for (let index = 0; index < bytes.length; index += 1) raw += String.fromCharCode(bytes[index])

    const placements = new Map<string, { width: number; height: number; x: number; y: number }>()
    const pattern = /q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm \/(ImU|ImS|ImD) Do Q/g
    for (const match of raw.matchAll(pattern)) {
      const [, width, height, x, y, name] = match
      // La primera aparición de cada nombre es el membrete; los créditos del
      // cierre reutilizan "ImD" más abajo, en la última página.
      if (!placements.has(name)) placements.set(name, { width: Number(width), height: Number(height), x: Number(x), y: Number(y) })
    }

    const uteq = placements.get('ImU')!
    const system = placements.get('ImS')!
    const developer = placements.get('ImD')!
    expect(uteq && system && developer).toBeTruthy()

    // El escudo pertenece al bloque institucional principal: va arriba y no
    // compite en tamaño con los logos tecnológicos.
    expect(uteq.y).toBeGreaterThan(system.y + system.height)
    expect(uteq.height).toBeGreaterThan(system.height)

    // Detection-test y Olbrox quedan en la misma banda secundaria, con aire
    // visible entre ambos y dentro del ancho de contenido del informe.
    expect(system.y).toBeGreaterThan(660)
    expect(developer.y).toBeLessThan(60)
    expect(system.height).toBeGreaterThan(32)
    expect(system.height).toBeLessThanOrEqual(44.01)
    expect(developer.height).toBeLessThanOrEqual(32.01)
    expect(system.x).toBeGreaterThanOrEqual(56)
    expect(system.x + system.width).toBeLessThanOrEqual(539)
    expect(raw.match(/\/ImD Do Q/g)?.length).toBeGreaterThanOrEqual(1)
  })
})
