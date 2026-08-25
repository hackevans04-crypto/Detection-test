import { describe, expect, it } from 'vitest'
import { completeBackground, makeApplication, makeEvaluation } from '@/lib/evaluations/test-factory'
import { evaluationResults, instrumentProfile, instrumentResult } from '@/lib/evaluations/results'
import { buildReport } from '@/lib/evaluations/report'
import { generatePsychopedagogicalReport } from '@/lib/pdf-report'

const abcFull = makeApplication('test-abc', {
  'abc-1': { pd: '1' },
  'abc-2': { pd: '2' },
  'abc-3': { pd: '2' },
  'abc-4': { pd: '2' },
  'abc-5': { pd: '3' },
  'abc-6': { pd: '2' },
  'abc-7': { pd: '0' },
  'abc-8': { pd: '1' },
})

describe('Test ABC', () => {
  it('suma las puntuaciones y aplica el baremo cuando están los ocho subtests', () => {
    const evaluation = makeEvaluation({ instrumentApplications: { 'test-abc': abcFull } })
    const result = instrumentResult(evaluation, 'test-abc')!
    expect(result.pdTotal).toBe(13)
    expect(result.global).toEqual({ range: 'RANGO II', level: 'NIVEL MEDIO' })
    expect(result.recorded).toBe(8)
  })

  it('no calcula el rango global con subtests sin registrar', () => {
    const partial = makeApplication('test-abc', { 'abc-1': { pd: '3' }, 'abc-2': { pd: '3' } })
    const evaluation = makeEvaluation({ instrumentApplications: { 'test-abc': partial } })
    const result = instrumentResult(evaluation, 'test-abc')!
    expect(result.global).toBeNull()
    expect(result.notices.some((notice) => notice.startsWith('Faltan 6 de 8'))).toBe(true)
  })
})

describe('PRO-CÁLCULO', () => {
  it('no clasifica una subárea sin PT y lo declara', () => {
    const application = makeApplication('pro-calculo', { 'pc-1': { pd: '8' } })
    const evaluation = makeEvaluation({ instrumentApplications: { 'pro-calculo': application } })
    const result = instrumentResult(evaluation, 'pro-calculo')!
    expect(result.rows[0].pd).toBe(8)
    expect(result.rows[0].pt).toBeNull()
    expect(result.rows[0].classification).toBeNull()
    expect(result.notices).toContain('Conversión de PD a PT pendiente de tablas normativas.')
  })

  it('clasifica con la PT ingresada por el profesional', () => {
    const application = makeApplication('pro-calculo', {
      'pc-1': { pd: '8', pt: '41' },
      'pc-2': { pd: '2', pt: '38' },
      'pc-3': { pd: '8', pt: '65' },
    })
    const evaluation = makeEvaluation({ instrumentApplications: { 'pro-calculo': application } })
    const result = instrumentResult(evaluation, 'pro-calculo')!
    expect(result.rows[0].classification).toBe('NORMAL')
    expect(result.rows[1].classification).toBe('BAJO / PRESENTA DIFICULTADES')
    expect(result.rows[2].classification).toBe('ALTO')
  })

  it('nunca produce un rango global: el instrumento no define baremo total', () => {
    const application = makeApplication('pro-calculo', { 'pc-1': { pd: '8', pt: '41' } })
    const evaluation = makeEvaluation({ instrumentApplications: { 'pro-calculo': application } })
    expect(instrumentResult(evaluation, 'pro-calculo')!.global).toBeNull()
  })
})

describe('perfil por instrumento', () => {
  it('ordena de menor a mayor desempeño y reparte por banda', () => {
    const evaluation = makeEvaluation({ instrumentApplications: { 'test-abc': abcFull } })
    const profile = instrumentProfile(instrumentResult(evaluation, 'test-abc')!)

    expect(profile.points).toHaveLength(8)
    expect(profile.points[0].band).toBe('low')
    expect(profile.points.at(-1)!.band).toBe('high')
    // El reparto cuenta exactamente los mismos ocho subtests.
    expect(profile.distribution.reduce((sum, slice) => sum + slice.count, 0)).toBe(8)
  })

  it('deja fuera la subárea sin PT y lo declara', () => {
    const evaluation = makeEvaluation({
      instrumentApplications: {
        'pro-calculo': makeApplication('pro-calculo', { 'pc-1': { pd: '8' }, 'pc-2': { pd: '2', pt: '38' } }),
      },
    })
    const profile = instrumentProfile(instrumentResult(evaluation, 'pro-calculo')!)

    expect(profile.points).toHaveLength(1)
    expect(profile.points[0].caption).toBe('PT 38')
    expect(profile.points[0].band).toBe('low')
    // Las ocho subáreas restantes del catálogo tampoco tienen PT.
    expect(profile.omitted).toBe(8)
  })

  it('no mezcla escalas: cada instrumento trae la suya', () => {
    const evaluation = makeEvaluation({
      instrumentApplications: {
        'test-abc': abcFull,
        'pro-calculo': makeApplication('pro-calculo', { 'pc-1': { pd: '2', pt: '55' } }),
      },
    })
    const [abc, pro] = evaluationResults(evaluation).map(instrumentProfile)

    expect(abc.scaleCaption).toContain('sobre su máximo')
    expect(pro.scaleCaption).toContain('40 a 60')
    expect(pro.points[0].band).toBe('mid')
  })
})

describe('informe', () => {
  const evaluation = makeEvaluation({
    functionalAreas: makeEvaluation().functionalAreas,
    instrumentApplications: { 'test-abc': abcFull },
    interpretation: 'Interpretación redactada por el profesional.',
    conclusions: [{ id: 'conclusion-1', text: 'Conclusiones redactadas por el profesional.', createdAt: '2026-08-01T10:00:00.000Z' }],
    recommendations: {
      docentes: [{ id: 'recommendation-1', text: 'Apoyos concretos para el estudiante.', createdAt: '2026-08-01T10:00:00.000Z' }],
      'pedagogo-apoyo': [],
      dece: [],
      'representante-legal': [],
      psicopedagogo: [],
    },
  })

  it('produce los diez apartados en orden', () => {
    const document = buildReport(evaluation)
    expect(document.sections.map((section) => section.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(document.sections[5].title).toBe('Interpretación')
  })

  it('traslada literalmente lo que escribió el profesional', () => {
    const document = buildReport(evaluation)
    const interpretation = document.sections[5].blocks[0]
    expect(interpretation).toEqual({ kind: 'paragraph', text: 'Interpretación redactada por el profesional.' })
  })

  it('no inventa contenido en los apartados vacíos', () => {
    const empty = buildReport(makeEvaluation())
    expect(empty.sections[6].blocks[0]).toEqual({ kind: 'paragraph', text: 'No registrado.' })
  })

  it('vuelca los antecedentes registrados en el apartado 3', () => {
    // Se guardan bajo «bloque.campo»; leerlos por el id del campo a secas
    // dejaba el apartado siempre en «No registrado».
    const withBackground = makeEvaluation({ background: completeBackground() })
    const [first] = buildReport(withBackground).sections.filter((section) => section.number === 3)

    expect(first.blocks[0]).toEqual({ kind: 'subheading', text: 'Desarrollo' })
    const pairs = first.blocks.find((block) => block.kind === 'pairs')
    expect(pairs).toBeDefined()
    expect(pairs!.kind === 'pairs' && pairs!.items.length).toBeGreaterThan(0)
  })

  it('lleva el desempeño de cada área observada al apartado 4', () => {
    const areas = makeEvaluation().functionalAreas
    areas['motricidad-fina'] = {
      description: 'Trazo irregular al copiar figuras.',
      performance: 'Dificultad marcada',
      observations: 'Requiere guía verbal.',
      fields: {},
    }
    const [section] = buildReport(makeEvaluation({ functionalAreas: areas })).sections.filter(
      (item) => item.number === 4,
    )
    const table = section.blocks.find((block) => block.kind === 'table')

    expect(table).toBeDefined()
    expect(table!.kind === 'table' && table!.rows[0]).toEqual([
      'Motricidad fina',
      'Dificultad marcada',
      'Trazo irregular al copiar figuras.',
    ])
  })

  it('genera un PDF paginado y con xref coherente', async () => {
    const blob = generatePsychopedagogicalReport(buildReport(evaluation))
    const text = Buffer.from(await blob.arrayBuffer()).toString('latin1')

    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)

    const count = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(text)?.[1])
    expect(count).toBeGreaterThan(1)

    // Cada offset de la tabla xref tiene que apuntar al inicio de su objeto.
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1])
    const declared = Number(/xref\n0 (\d+)/.exec(text.slice(startxref))![1])
    const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]))
    // La tabla declara un hueco inicial más un objeto por entrada.
    expect(offsets).toHaveLength(declared - 1)
    offsets.forEach((offset, index) => {
      expect(text.slice(offset, offset + 12)).toContain(`${index + 1} 0 obj`)
    })
  })

  it('conserva las tildes codificando en Latin-1', async () => {
    const blob = generatePsychopedagogicalReport(buildReport(evaluation))
    const text = Buffer.from(await blob.arrayBuffer()).toString('latin1')
    expect(text).toContain('/Encoding /WinAnsiEncoding')
    expect(text).toContain('INTERPRETACIÓN')
  })

  it('imprime la viñeta como viñeta y no como interrogación', async () => {
    // WinAnsi coloca el punto de lista en 0x95, fuera de Latin-1: sin la tabla
    // de equivalencias cada conclusión salía encabezada por un «?».
    const blob = generatePsychopedagogicalReport(buildReport(evaluation))
    const text = Buffer.from(await blob.arrayBuffer()).toString('latin1')

    expect(text).toContain(String.fromCharCode(0x95) + " Conclusiones redactadas por el profesional.")
    expect(text).not.toContain("? Conclusiones redactadas")
  })

  it('numera las páginas sobre el total y firma el pie', async () => {
    const blob = generatePsychopedagogicalReport(buildReport(evaluation))
    const text = Buffer.from(await blob.arrayBuffer()).toString('latin1')
    const count = Number(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(text)?.[1])

    expect(text).toContain(`Página 1 de ${count}`)
    expect(text).toContain(`Página ${count} de ${count}`)
  })

  it('sale sin membrete cuando no hay logos, en vez de fallar', async () => {
    const blob = generatePsychopedagogicalReport(buildReport(evaluation), {})
    const text = Buffer.from(await blob.arrayBuffer()).toString('latin1')

    expect(text).not.toContain('/Subtype /Image')
    // El texto institucional sí se imprime aunque falten los escudos.
    expect(text).toContain('UNIVERSIDAD TÉCNICA ESTATAL DE QUEVEDO')
  })
})
