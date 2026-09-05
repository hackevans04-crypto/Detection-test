import type { InstrumentResultBundle } from '@/lib/instruments/evaluation-results-aggregator'

export type InstrumentPartialReport = {
  status: 'AI_DRAFT'
  title: string
  sections: Array<{ title: string; body: string[] }>
  canApprove: false
}

export function buildInstrumentPartialReport(bundle: InstrumentResultBundle): InstrumentPartialReport | null {
  if (bundle.results.length === 0) return null

  const normativeNotice =
    bundle.status === 'NORMATIVE_READY'
      ? []
      : ['Resultado descriptivo sin interpretación normativa completa para la referencia disponible.']

  return {
    status: 'AI_DRAFT',
    title: `Informe del instrumento - ${bundle.instrumentIdentity}`,
    canApprove: false,
    sections: [
      { title: 'Identificación', body: [bundle.instrumentIdentity] },
      { title: 'Aplicabilidad', body: [bundle.applicability] },
      { title: 'Material utilizado', body: bundle.evidence.length ? bundle.evidence : ['Sin evidencia documental registrada.'] },
      {
        title: 'Resultados',
        body: bundle.results.map((result) => `${result.label}: ${result.value} (${result.source})`),
      },
      { title: 'Interpretación IA', body: [bundle.interpretation.summary, ...bundle.interpretation.findings] },
      { title: 'Limitaciones', body: [...normativeNotice, ...bundle.limitations] },
      { title: 'Trazabilidad', body: [`Estado del informe: ${bundle.reportStatus}`] },
    ],
  }
}
