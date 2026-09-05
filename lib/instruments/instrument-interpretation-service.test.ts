import { describe, expect, it } from 'vitest'
import { makeEvaluation } from '@/lib/evaluations/test-factory'
import { buildInstrumentInterpretationDraft } from '@/lib/instruments/instrument-interpretation-service'

describe('instrument interpretation service', () => {
  it('genera borrador IA sin aprobar ni inventar diagnóstico', () => {
    const draft = buildInstrumentInterpretationDraft({
      evaluation: makeEvaluation(),
      instrumentIdentity: 'STAI',
      scoreResult: null,
      importedResults: [{ measureId: 'total', label: 'Total', rawValue: '42', transformedValue: null, percentile: null, classification: null, sourceFile: 'resultados.xlsx', sourceLocation: null, confidence: 0.8 }],
      normativelyApplicable: false,
    })

    expect(draft.status).toBe('AI_DRAFT')
    expect(draft.findings.join(' ')).toContain('42')
    expect(draft.limitations.join(' ')).toContain('sin interpretación normativa')
    expect(draft.summary.toLowerCase()).not.toContain('diagnóstico')
  })
})
