import { describe, expect, it } from 'vitest'
import { createEvaluationInstrument } from '@/lib/evaluations/model'
import { makeEvaluation } from '@/lib/evaluations/test-factory'
import { buildReport } from '@/lib/evaluations/report'
import { createInstrumentPackage } from '@/lib/instruments/import/package-model'
import { aggregateEvaluationResults, buildInstrumentResultBundles } from '@/lib/instruments/evaluation-results-aggregator'
import { buildInstrumentVisualizations } from '@/lib/instruments/instrument-visualizations'

describe('evaluation results aggregator', () => {
  it('transfiere resultados de paso 6 a bundles consumibles por paso 7', () => {
    const entry = createEvaluationInstrument({ instrumentId: 'pkg-stai', name: 'STAI', order: 1, applicationMode: 'IMPORTED', professionalId: 'prof', professionalName: 'Profesional' })
    const pkg = createInstrumentPackage({ evaluationId: 'eval-test', createdBy: 'prof' })
    pkg.id = 'pkg-stai'
    pkg.name = 'STAI'
    pkg.readiness = 'PARTIAL_READY'
    pkg.computedResults = [{ measureId: 'total', label: 'Total', rawValue: '42', transformedValue: null, percentile: null, classification: null, sourceFile: 'resultados.xlsx', sourceLocation: null, confidence: 0.8 }]
    const evaluation = makeEvaluation({ battery: [entry], instrumentPackages: [pkg] })

    const bundles = buildInstrumentResultBundles(evaluation)
    const summary = aggregateEvaluationResults(evaluation)

    expect(bundles[0]).toMatchObject({ instrumentIdentity: 'STAI', status: 'DESCRIPTIVE_READY' })
    expect(summary).toMatchObject({ instrumentsProcessed: 1, instrumentsWithResults: 1, quantitativeResults: 1 })
  })

  it('marca MACI adulto como no aplicable normativamente sin perder resultados descriptivos', () => {
    const entry = createEvaluationInstrument({ instrumentId: 'pkg-maci', name: 'MACI', order: 1, applicationMode: 'IMPORTED', professionalId: 'prof', professionalName: 'Profesional' })
    const pkg = createInstrumentPackage({ evaluationId: 'eval-test', createdBy: 'prof' })
    pkg.id = 'pkg-maci'
    pkg.name = 'MACI'
    pkg.readiness = 'PARTIAL_READY'
    pkg.computedResults = [{ measureId: 'total', label: 'Total', rawValue: '63', transformedValue: null, percentile: null, classification: null, sourceFile: 'MACI.xls', sourceLocation: 'Resultados!B2', confidence: 0.8 }]
    const evaluation = makeEvaluation({
      initialData: {
        ...makeEvaluation().initialData,
        person: { ...makeEvaluation().initialData.person, birthDate: '1998-01-01' },
        evaluationDate: '2026-09-04',
      },
      battery: [entry],
      instrumentPackages: [pkg],
    })

    const [bundle] = buildInstrumentResultBundles(evaluation)

    expect(bundle).toMatchObject({
      instrumentIdentity: 'MACI',
      status: 'DESCRIPTIVE_READY',
      applicability: 'NOT_APPLICABLE',
    })
    expect(bundle.results).toHaveLength(1)
    expect(bundle.limitations.join(' ')).toContain('fuera del rango normativo')
  })

  it('genera visualizaciones universales sin inventar un resultado general', () => {
    const entry = createEvaluationInstrument({ instrumentId: 'pkg-stai', name: 'STAI', order: 1, applicationMode: 'IMPORTED', professionalId: 'prof', professionalName: 'Profesional' })
    const pkg = createInstrumentPackage({ evaluationId: 'eval-test', createdBy: 'prof' })
    pkg.id = 'pkg-stai'
    pkg.name = 'STAI'
    pkg.computedResults = [
      { measureId: 'estado', label: 'Ansiedad estado', rawValue: '38', transformedValue: null, percentile: 65, classification: 'Medio', sourceFile: 'STAI.xlsx', sourceLocation: 'Resultados!B2', confidence: 0.87 },
      { measureId: 'rasgo', label: 'Ansiedad rasgo', rawValue: '44', transformedValue: null, percentile: 78, classification: 'Alto', sourceFile: 'STAI.xlsx', sourceLocation: 'Resultados!C2', confidence: 0.86 },
    ]

    const [bundle] = buildInstrumentResultBundles(makeEvaluation({ battery: [entry], instrumentPackages: [pkg] }))
    const [chart] = buildInstrumentVisualizations(bundle)

    expect(bundle.results.map((result) => result.label)).toEqual(['Ansiedad estado', 'Ansiedad rasgo'])
    expect(chart).toMatchObject({
      type: 'percentile',
      unit: 'Percentil',
      maxValue: 100,
    })
    expect(chart.values.map((point) => point.caption)).toEqual(['P65', 'P78'])
  })

  it('conecta instrumentos importados con el informe y sus graficos', () => {
    const entry = createEvaluationInstrument({ instrumentId: 'pkg-stai', name: 'STAI', order: 1, applicationMode: 'IMPORTED', professionalId: 'prof', professionalName: 'Profesional' })
    const pkg = createInstrumentPackage({ evaluationId: 'eval-test', createdBy: 'prof' })
    pkg.id = 'pkg-stai'
    pkg.name = 'STAI'
    pkg.computedResults = [
      { measureId: 'estado', label: 'Ansiedad estado', rawValue: '38', transformedValue: null, percentile: 65, classification: 'Medio', sourceFile: 'STAI.xlsx', sourceLocation: 'Resultados!B2', confidence: 0.87 },
      { measureId: 'rasgo', label: 'Ansiedad rasgo', rawValue: '44', transformedValue: null, percentile: 78, classification: 'Alto', sourceFile: 'STAI.xlsx', sourceLocation: 'Resultados!C2', confidence: 0.86 },
    ]
    const document = buildReport(makeEvaluation({ battery: [entry], instrumentPackages: [pkg] }))
    const reportText = JSON.stringify(document)

    expect(reportText).toContain('STAI')
    expect(reportText).toContain('Ansiedad estado')
    expect(reportText).toContain('perfil percentilar')
    expect(reportText).not.toContain('No se aplicaron instrumentos estandarizados')
  })
})
