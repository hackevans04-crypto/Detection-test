'use client'

import Link from 'next/link'
import { type CSSProperties, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calculator,
  CheckCircle2,
  ChevronDown,
  Database,
  FileCheck2,
  Gauge,
  Info,
  type LucideIcon,
  PencilLine,
  ShieldCheck,
} from 'lucide-react'
import { TextareaField } from '@/components/ui/fields'
import { EmptyState } from '@/components/ui/states'
import { StepCard } from '@/features/evaluations/workspace/evaluation-workspace'
import { StepFooter } from '@/features/evaluations/workspace/step-footer'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { evaluationResults, instrumentProfile, type InstrumentResult, type ProfileBand } from '@/lib/evaluations/results'
import { buildInstrumentResultBundles, type InstrumentResultBundle } from '@/lib/instruments/evaluation-results-aggregator'
import { getStep6CompletionState } from '@/lib/instruments/step6-completion'
import { type InstrumentVisualization } from '@/lib/instruments/instrument-visualizations'
import { buildEvaluationAnalytics } from '@/lib/evaluations/analytics/build-evaluation-analytics'
import { chartAreaFallback } from '@/lib/evaluations/analytics/build-instrument-analytics'
import type { EvaluationAnalytics, InstrumentAnalytics } from '@/lib/evaluations/analytics/types'
import { orDash } from '@/lib/evaluations/format'

const bandColor: Record<ProfileBand, string> = {
  low: 'var(--dt-danger)',
  mid: 'var(--dt-warning)',
  high: 'var(--dt-success)',
}

/**
 * Resultados e interpretación.
 *
 * Un instrumento por pestaña, y dentro de cada uno la misma lectura de tres
 * partes: el resultado que sale del baremo, el protocolo que lo sostiene y la
 * tabla de referencia. Abajo, separada por una línea, la interpretación que
 * escribe el profesional. El sistema calcula; nadie más que una persona
 * interpreta.
 */
export function ResultsStep() {
  const { evaluation, update } = useEvaluation()
  const results = evaluationResults(evaluation)
  const step6State = getStep6CompletionState(evaluation)
  const [activeId, setActiveId] = useState<string | null>(null)
  // Fuente única de KPIs, gráficos y confianza: Step 7, la vista previa y el
  // PDF calculan estos mismos números a partir de esta misma función.
  const analytics = buildEvaluationAnalytics(evaluation)

  // `step6State.bundles` viene filtrado a los que sí tienen resultados — sirve
  // para decidir si mostrar esta pantalla, pero no para la lista de pestañas:
  // un instrumento sin resultados no debe desaparecer, debe mostrar su estado
  // vacío. Por eso aquí se usan TODOS los bundles, sin filtrar.
  if (results.length === 0 && step6State.bundles.length > 0) {
    return <ImportedResultsStep bundles={buildInstrumentResultBundles(evaluation)} analytics={analytics} />
  }

  if (results.length === 0 && step6State.status === 'COMPLETED_WITH_LIMITATIONS') {
    return <Step6LimitationsStep analytics={analytics} evaluationId={evaluation.id} />
  }

  if (results.length === 0) {
    return (
      <StepCard step="resultados">
        <EmptyState
          icon={Calculator}
          title="Todavía no hay resultados disponibles"
          description="Paso 7 se activa con resultados reales producidos en Instrumentos IA o registrados manualmente."
          action={{ label: 'Ir a instrumentos', href: `/evaluaciones/${evaluation.id}/instrumentos` }}
        />
      </StepCard>
    )
  }

  const active = results.find((result) => result.instrument.id === activeId) ?? results[0]

  return (
    <StepCard
      step="resultados"
      description="Los datos calculados provienen de lo registrado y de los baremos del instrumento. La interpretación la escribes tú."
      aside={
        <span className="dt-badge" data-tone="neutral">
          {results.length} {results.length === 1 ? 'instrumento aplicado' : 'instrumentos aplicados'}
        </span>
      }
    >
      <AnalyticsOverview analytics={analytics} />

      <div className="dt-tabs" role="tablist" aria-label="Instrumentos aplicados">
        {results.map((result) => (
          <button
            key={result.instrument.id}
            type="button"
            role="tab"
            className="dt-tab"
            aria-selected={result.instrument.id === active.instrument.id}
            onClick={() => setActiveId(result.instrument.id)}
          >
            {result.instrument.nombre}
            <span className="dt-tab-count">
              {result.recorded}/{result.total}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5">
        <InstrumentResultPanel key={active.instrument.id} result={active} evaluationId={evaluation.id} />
      </div>

      <hr className="dt-divider" />

      <section aria-labelledby="interpretacion">
        <h3 id="interpretacion" className="dt-section-title">
          <PencilLine aria-hidden="true" />
          Interpretación profesional
        </h3>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: 'var(--dt-muted)' }}>
          Lectura psicopedagógica del conjunto: relaciona lo observado con los antecedentes y con el desempeño de cada
          área. Este texto pasa íntegro al apartado 6 del informe.
        </p>
        <div className="mt-4">
          <TextareaField
            label="Interpretación de los resultados"
            required
            value={evaluation.interpretation}
            onChange={(next) => update((current) => ({ ...current, interpretation: next }))}
            placeholder="Relaciona lo observado con los antecedentes y con el desempeño registrado en cada área…"
            rows={7}
          />
        </div>
      </section>

      <StepFooter step="resultados" />
    </StepCard>
  )
}

function Step6LimitationsStep({ analytics, evaluationId }: { analytics: EvaluationAnalytics; evaluationId: string }) {
  const { summary } = analytics
  const limitations = analytics.limitations.length ? analytics.limitations : ['No hay resultados calculables para este instrumento.']

  return (
    <StepCard
      step="resultados"
      description="Paso 7 recibe el cierre funcional de Instrumentos IA y deja trazabilidad cuando no hay respuestas puntuables."
      aside={
        <span className="dt-badge" data-tone="warning">
          Cierre con limitaciones
        </span>
      }
    >
      <AnalyticsOverview analytics={analytics} />

      <div className="dt-results">
        <aside className="dt-block">
          <h3 className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
            Estado del procesamiento
          </h3>
          <div className="dt-score mt-5">
            <p className="dt-score-value">{summary.processedFiles}</p>
            <p className="dt-score-caption">materiales incorporados</p>
          </div>
          <dl className="dt-meta-list mt-5">
            <div>
              <dt>Instrumentos</dt>
              <dd>{summary.instrumentCount}</dd>
            </div>
            <div>
              <dt>Paquetes</dt>
              <dd>{summary.packageCount}</dd>
            </div>
            <div>
              <dt>Respuestas</dt>
              <dd>{summary.detectedResponses}</dd>
            </div>
            <div>
              <dt>Confianza de extracción</dt>
              <dd>{summary.averageConfidencePct !== null ? `${summary.averageConfidencePct}%` : '—'}</dd>
            </div>
          </dl>

          <Link href={`/evaluaciones/${evaluationId}/instrumentos`} className="dt-btn dt-btn-secondary dt-btn-block mt-5">
            Volver a instrumentos
            <ArrowRight aria-hidden="true" />
          </Link>
        </aside>

        <div className="min-w-0">
          <section className="dt-block" aria-labelledby="cierre-instrumentos-title">
            <h3 id="cierre-instrumentos-title" className="dt-section-title">
              <AlertTriangle aria-hidden="true" />
              Instrumento digitalizado sin aplicación completada
            </h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--dt-muted)' }}>
              El material quedó clasificado y persistido, pero no se encontró una hoja de respuestas o registro completado
              del evaluado para calcular puntuaciones.
            </p>
            <CollapsibleLimitations limitations={limitations} />
          </section>
        </div>

        <aside className="dt-block dt-results-scale">
          <h3 className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
            Continuidad
          </h3>
          <p className="mt-3 text-sm" style={{ color: 'var(--dt-muted)' }}>
            Para habilitar resultados estadísticos, agregue respuestas del evaluado o registre la aplicación manual desde
            Instrumentos IA.
          </p>
        </aside>
      </div>

      <StepFooter step="resultados" />
    </StepCard>
  )
}

/**
 * Un aviso amarillo gigante por limitación abrumaba la pantalla cuando había
 * varias. Colapsado por defecto, se expande con un clic cuando hace falta el
 * detalle.
 */
function CollapsibleLimitations({ limitations }: { limitations: string[] }) {
  const [open, setOpen] = useState(false)

  if (limitations.length <= 1) {
    return (
      <ul className="mt-4 grid gap-2">
        {limitations.map((limitation, index) => (
          <li key={`${limitation}-${index}`} className="dt-note" data-tone="warning">
            <Info aria-hidden="true" />
            {limitation}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="mt-4">
      <button type="button" className="dt-note dt-note-toggle" data-tone="warning" onClick={() => setOpen((value) => !value)}>
        <Info aria-hidden="true" />
        {limitations.length} limitaciones detectadas · {open ? 'Ocultar detalles' : 'Ver detalles'}
        <ChevronDown aria-hidden="true" data-open={open} />
      </button>
      {open ? (
        <ul className="mt-2 grid gap-2">
          {limitations.map((limitation, index) => (
            <li key={`${limitation}-${index}`} className="dt-note" data-tone="warning">
              <Info aria-hidden="true" />
              {limitation}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

type OverviewKpi = {
  label: string
  value: string
  detail: string
  tone: 'primary' | 'success' | 'warning' | 'neutral'
  icon: LucideIcon
  meter?: number | null
  visual: 'ring' | 'sparkline' | 'bars' | 'stack' | 'dots' | 'risk'
  series: number[]
}

function AnalyticsOverview({ analytics }: { analytics: EvaluationAnalytics }) {
  const kpis = overviewKpis(analytics.summary)

  return (
    <section className="dt-results-overview" aria-labelledby="resultados-indicadores-title">
      <div className="dt-results-overview-head">
        <div>
          <p className="dt-kicker">Indicadores clínicos</p>
          <h3 id="resultados-indicadores-title">Lectura ejecutiva del expediente</h3>
          <p>
            Indicadores calculados con los datos consolidados de Instrumentos IA, registros manuales y evidencia aceptada.
          </p>
        </div>
        <span className="dt-results-overview-status">
          {analytics.summary.instrumentsWithResults}/{analytics.summary.instrumentCount} con resultados
        </span>
      </div>

      <dl className="dt-results-kpi-grid">
        {kpis.map((item) => (
          <div key={item.label} data-tone={item.tone}>
            <span className="dt-kpi-icon" aria-hidden="true">
              <item.icon />
            </span>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
            <small>{item.detail}</small>
            {typeof item.meter === 'number' ? (
              <span className="dt-kpi-meter" aria-hidden="true">
                <i style={{ width: `${Math.max(3, Math.min(100, item.meter))}%` }} />
              </span>
            ) : null}
            <KpiMicroVisual item={item} />
          </div>
        ))}
      </dl>

      {analytics.overviewCharts.length > 0 ? (
        <div className="dt-bi-grid dt-bi-grid-overview" aria-label="Gráficos estadísticos del expediente">
          {analytics.overviewCharts.map((chart) => (
            <ResultChart key={chart.id} chart={chart} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

function overviewKpis(summary: EvaluationAnalytics['summary']): OverviewKpi[] {
  const pct = (value: number | null) => (value === null ? 'No disponible' : `${value}%`)
  const completionPct = summary.instrumentCount ? Math.round((summary.instrumentsWithResults / summary.instrumentCount) * 100) : null

  return [
    {
      label: 'Avance instrumental',
      value: pct(completionPct),
      detail: `${summary.instrumentsWithResults} de ${summary.instrumentCount} instrumentos con resultados`,
      tone: completionPct === 100 ? 'success' : summary.instrumentsWithResults > 0 ? 'primary' : 'warning',
      icon: Activity,
      meter: completionPct,
      visual: 'ring',
      series: [completionPct ?? 0],
    },
    {
      label: 'Calidad del dato',
      value: pct(summary.dataQualityPct),
      detail: `Confianza ${pct(summary.averageConfidencePct)} · evidencia ${pct(summary.evidenceCoveragePct)}`,
      tone: summary.dataQualityPct === null ? 'neutral' : summary.dataQualityPct >= 80 ? 'success' : summary.dataQualityPct >= 60 ? 'primary' : 'warning',
      icon: ShieldCheck,
      meter: summary.dataQualityPct,
      visual: 'sparkline',
      series: [summary.averageConfidencePct ?? 0, summary.coveragePct ?? 0, summary.evidenceCoveragePct ?? 0],
    },
    {
      label: 'Resultados válidos',
      value: String(summary.resultCount),
      detail: `${summary.normativeInstrumentCount} normativos · ${summary.descriptiveInstrumentCount} descriptivos`,
      tone: summary.resultCount > 0 ? 'success' : 'warning',
      icon: FileCheck2,
      meter: summary.instrumentCount ? (summary.instrumentsWithResults / summary.instrumentCount) * 100 : null,
      visual: 'bars',
      series: [
        summary.normativeInstrumentCount,
        summary.descriptiveInstrumentCount,
        summary.rawInstrumentCount,
        summary.noResultInstrumentCount,
      ],
    },
    {
      label: 'Aplicabilidad',
      value: `${summary.applicableInstrumentCount}/${summary.instrumentCount}`,
      detail: `${summary.nonApplicableInstrumentCount} fuera de rango · ${summary.unknownApplicabilityCount} por validar`,
      tone: summary.nonApplicableInstrumentCount > 0 || summary.unknownApplicabilityCount > 0 ? 'warning' : 'success',
      icon: CheckCircle2,
      meter: summary.instrumentCount ? (summary.applicableInstrumentCount / summary.instrumentCount) * 100 : null,
      visual: 'stack',
      series: [summary.applicableInstrumentCount, summary.nonApplicableInstrumentCount, summary.unknownApplicabilityCount],
    },
    {
      label: 'Cobertura de respuestas',
      value: pct(summary.coveragePct),
      detail: `${summary.validResponses} válidas de ${summary.detectedResponses} detectadas`,
      tone: summary.coveragePct === null ? 'neutral' : summary.coveragePct >= 80 ? 'success' : 'warning',
      icon: Database,
      meter: summary.coveragePct,
      visual: 'dots',
      series: [summary.validResponses, Math.max(0, summary.detectedResponses - summary.validResponses)],
    },
    {
      label: 'Limitaciones',
      value: String(summary.limitationCount),
      detail: summary.limitationCount > 0 ? 'Requieren validación profesional' : 'Sin limitaciones registradas',
      tone: summary.limitationCount > 0 ? 'warning' : 'success',
      icon: Gauge,
      meter: summary.instrumentCount ? Math.max(0, 100 - (summary.limitationCount / Math.max(summary.instrumentCount, 1)) * 100) : null,
      visual: 'risk',
      series: [summary.limitationCount, Math.max(0, summary.instrumentCount - summary.limitationCount)],
    },
  ]
}

function KpiMicroVisual({ item }: { item: OverviewKpi }) {
  const total = Math.max(item.series.reduce((sum, value) => sum + value, 0), 1)

  if (item.visual === 'ring') {
    const value = Math.max(0, Math.min(100, item.series[0] ?? 0))
    return (
      <span
        className="dt-kpi-micro dt-kpi-ring"
        aria-hidden="true"
        style={{ '--dt-kpi-ring': `${(value / 100) * 360}deg` } as CSSProperties}
      />
    )
  }

  if (item.visual === 'sparkline') {
    const points = item.series.map((value, index) => `${(index / Math.max(item.series.length - 1, 1)) * 100},${100 - Math.max(0, Math.min(100, value))}`)
    return (
      <svg className="dt-kpi-micro dt-kpi-spark" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <polyline points={points.join(' ')} />
      </svg>
    )
  }

  if (item.visual === 'bars') {
    const max = Math.max(...item.series, 1)
    return (
      <span className="dt-kpi-micro dt-kpi-bars" aria-hidden="true">
        {item.series.map((value, index) => (
          <i key={`${value}-${index}`} style={{ height: `${Math.max(10, (value / max) * 100)}%`, background: chartColor(index) }} />
        ))}
      </span>
    )
  }

  if (item.visual === 'stack') {
    return (
      <span className="dt-kpi-micro dt-kpi-stack" aria-hidden="true">
        {item.series.map((value, index) => (
          <i key={`${value}-${index}`} style={{ width: `${Math.max(6, (value / total) * 100)}%`, background: chartColor(index) }} />
        ))}
      </span>
    )
  }

  if (item.visual === 'dots') {
    const count = Math.max(4, Math.min(8, total))
    const filled = total > 0 ? Math.round(((item.series[0] ?? 0) / total) * count) : 0
    return (
      <span className="dt-kpi-micro dt-kpi-dots" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <i key={index} data-active={index < filled} />
        ))}
      </span>
    )
  }

  return (
    <span className="dt-kpi-micro dt-kpi-risk" aria-hidden="true">
      <i style={{ width: `${Math.max(6, ((item.series[0] ?? 0) / total) * 100)}%` }} />
    </span>
  )
}

function ImportedResultsStep({ bundles, analytics }: { bundles: InstrumentResultBundle[]; analytics: EvaluationAnalytics }) {
  const { evaluation } = useEvaluation()
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = bundles.find((bundle) => bundle.instrumentId === activeId) ?? bundles[0]
  const activeAnalytics = analytics.instruments.find((instrument) => instrument.id === active.instrumentId)

  return (
    <StepCard
      step="resultados"
      description="Resultados transferidos desde Instrumentos IA. Paso 7 consolida; no vuelve a importar archivos."
      aside={
        <span className="dt-badge" data-tone="success">
          {bundles.length} {bundles.length === 1 ? 'bundle recibido' : 'bundles recibidos'}
        </span>
      }
    >
      <AnalyticsOverview analytics={analytics} />

      <div className="dt-tabs mt-5" role="tablist" aria-label="Bundles de resultados">
        {bundles.map((bundle) => (
          <button
            key={bundle.instrumentId}
            type="button"
            role="tab"
            className="dt-tab"
            aria-selected={bundle.instrumentId === active.instrumentId}
            onClick={() => setActiveId(bundle.instrumentId)}
          >
            {bundle.instrumentIdentity}
            <span className="dt-tab-count">{bundle.results.length}</span>
          </button>
        ))}
      </div>

      {activeAnalytics ? (
        <ImportedResultPanel bundle={active} instrument={activeAnalytics} evaluationId={evaluation.id} />
      ) : null}
      <StepFooter step="resultados" />
    </StepCard>
  )
}

/**
 * Estructura fija por instrumento: cabecera, 4 KPI, visualización principal,
 * tabla de resultados, interpretación IA, evidencia y trazabilidad. Es la
 * misma secuencia que arma `buildResultBlocks` para el PDF — sólo cambia el
 * lienzo (HTML vs PDF), nunca el orden ni los datos.
 */
function ImportedResultPanel({
  bundle,
  instrument,
  evaluationId,
}: {
  bundle: InstrumentResultBundle
  instrument: InstrumentAnalytics
  evaluationId: string
}) {
  return (
    <div className="dt-results mt-5">
      <aside className="dt-block">
        <h3 className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
          Panel del instrumento
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--dt-muted)' }}>
          {instrument.name} · {instrument.statusLabel}
        </p>

        {/* Mismas cuatro cifras que ve el PDF para este instrumento — nada distinto entre pantallas. */}
        <dl className="dt-kpi-grid mt-5">
          <div className="dt-kpi-mini">
            <dt>Materiales</dt>
            <dd>{instrument.materials.length}</dd>
          </div>
          <div className="dt-kpi-mini">
            <dt>Fuentes</dt>
            <dd>{instrument.sourceCount}</dd>
          </div>
          <div className="dt-kpi-mini">
            <dt>Confianza</dt>
            <dd>{instrument.averageConfidencePct !== null ? `${instrument.averageConfidencePct}%` : '—'}</dd>
          </div>
          <div className="dt-kpi-mini">
            <dt>Cobertura</dt>
            <dd>{instrument.responseCoverage.pct !== null ? `${instrument.responseCoverage.pct}%` : '—'}</dd>
          </div>
        </dl>

        <dl className="dt-meta-list mt-5">
          <div>
            <dt>Estado</dt>
            <dd>{instrument.statusLabel}</dd>
          </div>
          <div>
            <dt>Aplicabilidad</dt>
            <dd>{instrument.applicabilityLabel}</dd>
          </div>
          <div>
            <dt>Medidas</dt>
            <dd>{instrument.resultCount}</dd>
          </div>
        </dl>

        <Link href={`/evaluaciones/${evaluationId}/instrumentos`} className="dt-btn dt-btn-secondary dt-btn-block mt-5">
          Ver evidencia
          <ArrowRight aria-hidden="true" />
        </Link>
      </aside>

      <div className="min-w-0">
        <h3 className="dt-section-title">
          <BarChart3 aria-hidden="true" />
          Visualización principal
        </h3>
        <InstrumentChartArea instrument={instrument} />

        <h3 className="dt-section-title mt-5">
          <Calculator aria-hidden="true" />
          Resultados del instrumento
        </h3>
        <div className="dt-table-wrap mt-3" style={{ border: '1px solid var(--dt-border)' }}>
          <table className="dt-table" data-compact="true">
            <caption className="dt-sr-only">Resultados importados de {bundle.instrumentIdentity}</caption>
            <thead>
              <tr>
                <th scope="col">Medida</th>
                <th scope="col">Valor</th>
                <th scope="col">Fuente</th>
              </tr>
            </thead>
            <tbody>
              {bundle.results.map((result, index) => (
                <tr key={`${result.label}-${result.source}-${index}`}>
                  <td style={{ color: 'var(--dt-text)', fontWeight: 600 }}>{result.label}</td>
                  <td>{result.value}</td>
                  <td>{result.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="dt-block mt-5" aria-labelledby="interpretacion-importada-title">
          <h4 id="interpretacion-importada-title" className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
            Interpretación IA
          </h4>
          <p className="mt-2 text-sm" style={{ color: 'var(--dt-muted)' }}>
            {bundle.interpretation.summary}
          </p>
          {bundle.interpretation.findings.length > 0 ? (
            <ul className="mt-3 grid gap-2">
              {bundle.interpretation.findings.map((finding, index) => (
                <li key={`${finding}-${index}`} className="dt-note">
                  <Info aria-hidden="true" />
                  {finding}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      <aside className="dt-block dt-results-scale">
        <h3 className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
          Limitaciones
        </h3>
        <CollapsibleLimitations
          limitations={instrument.limitations.length ? instrument.limitations : ['Sin limitaciones registradas para los resultados disponibles.']}
        />

        <h3 className="text-sm font-bold mt-5" style={{ color: 'var(--dt-text)' }}>
          Evidencia y trazabilidad
        </h3>
        {bundle.evidence.length > 0 ? (
          <ul className="dt-results-scale-list mt-3">
            {bundle.evidence.map((file) => (
              <li key={file} className="dt-gate-item" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
                <span className="dt-gate-body">
                  <strong>{file}</strong>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs" style={{ color: 'var(--dt-muted)' }}>
            Sin archivos de evidencia registrados.
          </p>
        )}
      </aside>
    </div>
  )
}

/**
 * El espacio de la visualización nunca queda vacío. Con datos reales, uno o
 * más gráficos según lo que el instrumento produjo; sin ellos, un estado
 * compacto con las cifras reales de procesamiento — nunca ceros disfrazados
 * de gráfico, ni un hueco en blanco donde debería ir uno.
 */
function InstrumentChartArea({ instrument }: { instrument: InstrumentAnalytics }) {
  if (instrument.charts.length > 0) {
    return (
      <div className="dt-bi-grid mt-3">
        {instrument.charts.map((chart) => (
          <ResultChart key={chart.id} chart={chart} />
        ))}
      </div>
    )
  }

  // Mismo texto que ve el PDF para este mismo caso — misma función, no una
  // frase propia de cada pantalla.
  const fallback = chartAreaFallback({
    hasCharts: false,
    results: instrument.results,
    materials: instrument.materials,
    detectedResponses: instrument.responseCoverage.detected,
  })!
  return (
    <div className="dt-bi-chart dt-bi-chart-empty mt-3">
      <strong>{fallback.title}</strong>
      <p>{fallback.text}</p>
    </div>
  )
}

function ResultChart({ chart }: { chart: InstrumentVisualization }) {
  if (chart.type === 'flow') return <FlowResultChart chart={chart} />
  if (chart.type === 'gauge') return <GaugeResultChart chart={chart} />
  if (chart.type === 'matrix') return <MatrixResultChart chart={chart} />
  if (chart.type === 'stacked') return <StackedResultChart chart={chart} />
  if (chart.type === 'percentile') return <PercentileResultChart chart={chart} />

  if (chart.type === 'donut') {
    const total = chart.values.reduce((sum, item) => sum + item.value, 0)
    const stops = chart.values.reduce(
      (state, item, index) => {
        const start = state.cursor
        const end = start + (item.value / Math.max(total, 1)) * 100
        const color = ['#16a34a', '#2563eb', '#f59e0b', '#dc2626', '#94a3b8'][index % 5]
        state.parts.push(`${color} ${start}% ${end}%`)
        state.cursor = end
        return state
      },
      { cursor: 0, parts: [] as string[] },
    )
    return (
      <figure className="dt-bi-chart" data-kind="donut">
        <figcaption>
          <strong>{chart.title}</strong>
          <span>{chart.unit} · Fuente: {chart.source}</span>
        </figcaption>
        <div className="dt-donut-chart" style={{ background: `conic-gradient(${stops.parts.join(', ')})` }}>
          <span>{total}</span>
        </div>
        <ul className="dt-chart-legend">
          {chart.values.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <strong>{item.caption}</strong>
            </li>
          ))}
        </ul>
      </figure>
    )
  }

  return (
    <figure className="dt-bi-chart">
      <figcaption>
        <strong>{chart.title}</strong>
        <span>{chart.unit} · Fuente: {chart.source}</span>
      </figcaption>
      <ul className="dt-bars mt-3">
        {chart.values.map((point, index) => (
          <li
            key={`${point.label}-${index}`}
            title={`${point.label}: ${point.caption}. Fuente: ${point.source}${point.classification ? `. Clasificación: ${point.classification}` : ''}`}
          >
            <span className="dt-bars-label">{point.label}</span>
            <span className="dt-bars-track">
              <span
                className="dt-bars-fill"
                style={{ width: `${Math.max(3, Math.min(100, (point.value / Math.max(chart.maxValue, 1)) * 100))}%`, background: 'var(--dt-primary)' }}
              />
            </span>
            <span className="dt-bars-value">{point.caption}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

function ChartCaption({ chart }: { chart: InstrumentVisualization }) {
  return (
    <figcaption>
      <strong>{chart.title}</strong>
      <span>{chart.unit} - Fuente: {chart.source}</span>
      {chart.insight ? <em>{chart.insight}</em> : null}
    </figcaption>
  )
}

function FlowResultChart({ chart }: { chart: InstrumentVisualization }) {
  return (
    <figure className="dt-bi-chart dt-flow-chart" data-kind="flow">
      <ChartCaption chart={chart} />
      <ol className="dt-flow-steps">
        {chart.values.map((point, index) => (
          <li key={`${point.label}-${index}`}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{point.caption}</strong>
            <small>{point.label}</small>
          </li>
        ))}
      </ol>
    </figure>
  )
}

function GaugeResultChart({ chart }: { chart: InstrumentVisualization }) {
  const point = chart.values[0]
  const value = point ? Math.max(0, Math.min(100, point.value)) : 0
  return (
    <figure className="dt-bi-chart dt-gauge-chart" data-kind="gauge">
      <ChartCaption chart={chart} />
      <div className="dt-gauge-meter" style={{ '--dt-gauge-stop': `${(0.5 * value) / 100}turn` } as CSSProperties}>
        <strong>{point?.caption ?? `${value}%`}</strong>
      </div>
      <div className="dt-gauge-scale" aria-hidden="true">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </figure>
  )
}

function MatrixResultChart({ chart }: { chart: InstrumentVisualization }) {
  return (
    <figure className="dt-bi-chart dt-matrix-chart" data-kind="matrix">
      <ChartCaption chart={chart} />
      <div className="dt-matrix-grid">
        {chart.values.map((point, index) => (
          <div key={`${point.label}-${index}`}>
            <strong>{point.caption}</strong>
            <span>{point.label}</span>
          </div>
        ))}
      </div>
    </figure>
  )
}

function StackedResultChart({ chart }: { chart: InstrumentVisualization }) {
  const total = chart.values.reduce((sum, item) => sum + item.value, 0)
  return (
    <figure className="dt-bi-chart dt-stacked-chart" data-kind="stacked">
      <ChartCaption chart={chart} />
      <div className="dt-stacked-track" aria-hidden="true">
        {chart.values.map((point, index) => (
          <i
            key={`${point.label}-${index}`}
            style={{
              width: `${Math.max(4, (point.value / Math.max(total, 1)) * 100)}%`,
              background: chartColor(index),
            }}
          />
        ))}
      </div>
      <ul className="dt-chart-legend">
        {chart.values.map((item, index) => (
          <li key={item.label}>
            <span>
              <i style={{ background: chartColor(index) }} />
              {item.label}
            </span>
            <strong>{item.caption}</strong>
          </li>
        ))}
      </ul>
    </figure>
  )
}

function PercentileResultChart({ chart }: { chart: InstrumentVisualization }) {
  return (
    <figure className="dt-bi-chart dt-percentile-chart" data-kind="percentile">
      <ChartCaption chart={chart} />
      <div className="dt-percentile-band" aria-hidden="true">
        <span data-band="low" />
        <span data-band="mid" />
        <span data-band="high" />
        {chart.values.map((point, index) => (
          <i
            key={`${point.label}-${index}`}
            style={{ left: `${Math.max(0, Math.min(100, point.value))}%`, background: chartColor(index) }}
            title={`${point.label}: ${point.caption}`}
          />
        ))}
      </div>
      <div className="dt-percentile-scale" aria-hidden="true">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
      <ul className="dt-percentile-list">
        {chart.values.map((point, index) => (
          <li key={`${point.label}-${index}`}>
            <span>
              <i style={{ background: chartColor(index) }} />
              {point.label}
            </span>
            <strong>{point.caption}</strong>
          </li>
        ))}
      </ul>
    </figure>
  )
}

function chartColor(index: number) {
  return ['#2563eb', '#14b8a6', '#f59e0b', '#16a34a', '#dc2626', '#64748b'][index % 6]
}

function InstrumentResultPanel({ result, evaluationId }: { result: InstrumentResult; evaluationId: string }) {
  const { instrument, rows, global } = result
  const isPdPt = instrument.scoringMode === 'pd_pt'
  const observations = rows.filter((row) => row.observations.trim().length > 0)

  return (
    <div className="dt-results">
      <aside className="dt-block">
        <h3 className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
          Resultado general
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--dt-muted)' }}>
          {instrument.nombre} · {instrument.subtitulo}
        </p>

        <div className="dt-score mt-5">
          <p className="dt-score-value">{global || !isPdPt ? result.pdTotal : '—'}</p>
          <p className="dt-score-caption">{isPdPt ? 'PD total' : 'Puntuación total'}</p>
        </div>

        <dl className="dt-meta-list mt-5">
          <div>
            <dt>Rango</dt>
            <dd>{global ? global.range : 'Pendiente de completar el registro'}</dd>
          </div>
          <div>
            <dt>Nivel</dt>
            <dd>{global ? global.level : '—'}</dd>
          </div>
          <div>
            <dt>Registro</dt>
            <dd>
              {result.recorded} de {result.total} {instrument.unidad.plural}
            </dd>
          </div>
        </dl>

        <Link
          href={`/evaluaciones/${evaluationId}/instrumentos/${instrument.id}`}
          className="dt-btn dt-btn-secondary dt-btn-block mt-5"
        >
          Ver interpretación
          <ArrowRight aria-hidden="true" />
        </Link>
      </aside>

      <div className="min-w-0">
        <h3 className="dt-section-title">
          <Calculator aria-hidden="true" />
          Protocolo de {instrument.unidad.plural}
        </h3>

        <div className="dt-table-wrap dt-scroll mt-3" style={{ border: '1px solid var(--dt-border)' }}>
          <table className="dt-table" data-compact="true">
            <caption className="dt-sr-only">Protocolo de {instrument.nombre}</caption>
            <thead>
              <tr>
                <th scope="col">{instrument.unidad.singular}</th>
                <th scope="col">{isPdPt ? 'PD' : 'Puntuación'}</th>
                {isPdPt ? <th scope="col">PT</th> : <th scope="col">Máximo</th>}
                {isPdPt ? <th scope="col">Clasificación</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.subtestId}>
                  <td style={{ color: 'var(--dt-text)', fontWeight: 600 }}>{row.nombre}</td>
                  <td>{row.pd ?? '—'}</td>
                  {isPdPt ? <td>{row.pt ?? '—'}</td> : <td>{row.max}</td>}
                  {isPdPt ? (
                    <td>
                      {row.classification ? (
                        <span
                          className="dt-badge"
                          data-tone={
                            row.classification.startsWith('BAJO')
                              ? 'danger'
                              : row.classification === 'ALTO'
                                ? 'success'
                                : 'neutral'
                          }
                        >
                          {row.classification}
                        </span>
                      ) : (
                        <span className="dt-badge" data-tone="warning">
                          Sin PT
                        </span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{result.pdTotal}</td>
                <td colSpan={isPdPt ? 2 : 1}>
                  {global ? `${global.range} · ${global.level}` : 'Se calcula al completar el registro.'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {result.notices.length > 0 ? (
          <ul className="mt-4 grid gap-2">
            {result.notices.map((notice) => (
              <li key={notice} className="dt-note" data-tone={notice.startsWith('Faltan') ? 'warning' : undefined}>
                {notice.startsWith('Faltan') ? <AlertTriangle aria-hidden="true" /> : <Info aria-hidden="true" />}
                {notice}
              </li>
            ))}
          </ul>
        ) : null}

        <InstrumentProfileChart result={result} />

        {observations.length > 0 ? (
          <>
            <h4 className="mt-5 text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
              Observaciones registradas
            </h4>
            <dl className="dt-meta-list mt-3">
              {observations.map((row) => (
                <div key={row.subtestId}>
                  <dt>{row.nombre}</dt>
                  <dd>{orDash(row.observations)}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : null}
      </div>

      <aside className="dt-block dt-results-scale">
        <h3 className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
          Baremo
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--dt-muted)' }}>
          Tabla publicada del instrumento.
        </p>
        <ul className="dt-results-scale-list mt-4">
          {instrument.baremos.map((baremo) => {
            const activeRow = global?.range === baremo.rango
            return (
              <li
                key={baremo.rango}
                className="dt-gate-item"
                data-complete={activeRow}
                style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}
              >
                <span className="dt-gate-body">
                  <strong>{baremo.rango}</strong>
                  <small>
                    {baremo.descripcion} · {baremo.nivel}
                  </small>
                </span>
              </li>
            )
          })}
        </ul>
        <p className="dt-note mt-4">
          <Info aria-hidden="true" />
          {instrument.normativeStatus}
        </p>
      </aside>
    </div>
  )
}

/**
 * Perfil del instrumento.
 *
 * Cada instrumento en su propia escala y con su reparto por banda arriba, que
 * es la lectura rápida: cuántas áreas caen bajo, medio y alto. Debajo, el
 * detalle ordenado de menor a mayor desempeño.
 */
function InstrumentProfileChart({ result }: { result: InstrumentResult }) {
  const profile = instrumentProfile(result)
  if (profile.points.length === 0) return null

  return (
    <section className="dt-block mt-5" aria-labelledby={`perfil-${result.instrument.id}`}>
      <h4 id={`perfil-${result.instrument.id}`} className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
        Perfil de {result.instrument.nombre}
      </h4>

      <ul className="dt-tally mt-3">
        {profile.distribution.map((slice) => (
          <li key={slice.band} className="dt-tally-item" data-band={slice.band}>
            <span className="dt-tally-count">{slice.count}</span>
            <span className="dt-tally-label">{slice.label}</span>
          </li>
        ))}
      </ul>

      <ul className="dt-bars mt-4">
        {profile.points.map((point, index) => (
          <li key={`${point.label}-${index}`}>
            <span className="dt-bars-label" title={point.label}>
              {point.label}
            </span>
            <span className="dt-bars-track">
              <span
                className="dt-bars-fill"
                style={{ width: `${Math.max(3, Math.round(point.ratio * 100))}%`, background: bandColor[point.band] }}
              />
            </span>
            <span className="dt-bars-value">{point.caption}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs" style={{ color: 'var(--dt-muted)' }}>
        {profile.scaleCaption}
        {profile.omitted > 0
          ? ` ${profile.omitted} ${profile.omitted === 1 ? 'medición queda' : 'mediciones quedan'} fuera del gráfico por no tener una escala comparable.`
          : ''}
      </p>
    </section>
  )
}
