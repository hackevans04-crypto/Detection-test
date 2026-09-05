import { describe, expect, it } from 'vitest'
import { buildInstrumentPartialReport } from '@/lib/instruments/instrument-report-service'
import type { InstrumentResultBundle } from '@/lib/instruments/evaluation-results-aggregator'

describe('instrument report service', () => {
  it('genera informe parcial IA sin aprobarlo', () => {
    const report = buildInstrumentPartialReport(bundle())

    expect(report).toMatchObject({
      status: 'AI_DRAFT',
      title: 'Informe del instrumento - STAI',
      canApprove: false,
    })
    expect(report?.sections.find((section) => section.title === 'Resultados')?.body[0]).toContain('42')
    expect(report?.sections.find((section) => section.title === 'Limitaciones')?.body.join(' ')).toContain('descriptivo')
  })

  it('no genera informe si no hay resultados reales', () => {
    expect(buildInstrumentPartialReport({ ...bundle(), results: [] })).toBeNull()
  })
})

function bundle(): InstrumentResultBundle {
  return {
    instrumentId: 'pkg-stai',
    instrumentIdentity: 'STAI',
    status: 'RAW_READY',
    applicability: 'UNKNOWN',
    results: [{ label: 'Total', value: '42', source: 'resultados.xlsx' }],
    charts: [{ id: 'resultados', title: 'Resultados disponibles', type: 'bar', values: [{ label: 'Total', value: 42 }] }],
    interpretation: {
      status: 'AI_DRAFT',
      summary: 'STAI: borrador basado en evidencia.',
      findings: ['Total: 42.'],
      strengths: [],
      alerts: [],
      limitations: [],
      draftConclusion: 'Integrar con expediente.',
      recommendations: [],
    },
    limitations: ['Sin interpretación normativa completa disponible.'],
    evidence: ['resultados.xlsx'],
    reportStatus: 'NOT_READY',
  }
}
