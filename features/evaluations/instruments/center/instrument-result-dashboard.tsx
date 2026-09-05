'use client'

import { useMemo } from 'react'
import { BarChart3, FileText, LineChart, Radar, Table2 } from 'lucide-react'
import { ProfileChart } from '@/features/evaluations/instruments/profile-chart'
import type { EvaluationInstrument, InstrumentNarrative, InstrumentOrientation } from '@/lib/evaluations/model'
import {
  bandDistribution,
  comparisonPairs,
  instrumentProfileChart,
  percentileRows,
  radarEligible,
  type InstrumentProfileChart,
  type ProfileRow,
} from '@/lib/instruments/charts'
import type { InstrumentPackage } from '@/lib/instruments/import/package-model'
import { scoreCompleteness, scoreFieldsFor, type ScoreField } from '@/lib/instruments/score-schema'
import { sessionTiming } from '@/lib/instruments/session-timing'

export function InstrumentResultDashboard({
  entry,
  battery,
  pkg,
  blueprints,
}: {
  entry: EvaluationInstrument
  battery: EvaluationInstrument[]
  pkg?: InstrumentPackage
  blueprints: Parameters<typeof scoreFieldsFor>[1]
}) {
  const fields = useMemo(() => scoreFieldsFor(entry, blueprints), [entry, blueprints])
  const chart = useMemo(() => instrumentProfileChart(entry, blueprints), [entry, blueprints])
  const rows = useMemo(() => [...scoreRows(entry, fields, chart), ...importedResultRows(pkg)], [entry, fields, chart, pkg])

  if (rows.length === 0) return null

  return (
    <section className="dt-result-dashboard" aria-labelledby="resultados-instrumento-title">
      <nav className="dt-result-tabs" aria-label="Secciones de resultados del instrumento">
        <a href="#resultado-general">Resultado</a>
        <a href="#perfil-escalas">Escalas</a>
        <a href="#estadisticas">Estadística</a>
        {entry.interpretation.text.trim() ? <a href="#interpretacion">Interpretación</a> : null}
        {entry.conclusion.text.trim() ? <a href="#conclusiones">Conclusiones</a> : null}
        {entry.orientations.some((item) => item.text.trim()) ? <a href="#recomendaciones">Recomendaciones</a> : null}
        {entry.report.status !== 'NOT_READY' ? <a href="#informe">Informe</a> : null}
      </nav>

      <div className="dt-result-grid">
        <ResultSummaryCard entry={entry} rows={rows} />
        <ResultKpiGrid entry={entry} fields={fields} chart={chart} rows={rows} />
      </div>

      <ScaleProfileChart entry={entry} chart={chart} />
      <PercentileBandChart rows={percentileRows(chart)} />
      <SubtestComparisonChart rows={rows} />
      <NormDistributionChart chart={chart} />
      <RadarProfileChart chart={chart} />
      <LongitudinalResultChart entry={entry} battery={battery} blueprints={blueprints} />
      <ScoreTable rows={rows} />
      <StatisticsTable entry={entry} fields={fields} chart={chart} />
      <InterpretationPanel narrative={entry.interpretation} />
      <ConclusionPanel narrative={entry.conclusion} />
      <RecommendationPanel orientations={entry.orientations} />
      <EvidenceDrawer pkg={pkg} />
      <InstrumentReportCard entry={entry} />
    </section>
  )
}

export function ResultSummaryCard({ entry, rows }: { entry: EvaluationInstrument; rows: ScoreRow[] }) {
  const main = rows[0]
  return (
    <article className="dt-ai-section dt-result-summary-card" id="resultado-general" aria-labelledby="resultado-general-title">
      <div className="dt-ai-section-head">
        <div>
          <BarChart3 aria-hidden="true" />
          <div>
            <h3 id="resultado-general-title">Resultado general</h3>
            <p>{entry.name}</p>
          </div>
        </div>
        <span className="dt-badge" data-tone={entry.report.status === 'APPROVED' ? 'success' : 'neutral'}>
          {entry.report.status === 'APPROVED' ? 'Aprobado' : 'En revisión'}
        </span>
      </div>
      <dl className="dt-result-highlight">
        <div>
          <dt>{main.label}</dt>
          <dd>{main.value}</dd>
        </div>
        <div>
          <dt>Clasificacion</dt>
          <dd>{main.classification}</dd>
        </div>
        {main.percentile !== null ? (
          <div>
            <dt>Percentil</dt>
            <dd>P{main.percentile}</dd>
          </div>
        ) : null}
      </dl>
      <p className="dt-ai-note">Se muestran solo puntuaciones registradas y escalas declaradas o baremos confirmados.</p>
    </article>
  )
}

export function ResultKpiGrid({
  entry,
  fields,
  chart,
  rows,
}: {
  entry: EvaluationInstrument
  fields: ScoreField[]
  chart: InstrumentProfileChart
  rows: ScoreRow[]
}) {
  const completeness = scoreCompleteness(entry, fields)
  const timing = sessionTiming(entry.events)
  const percentiles = percentileRows(chart)
  const distribution = bandDistribution(chart.rows)

  const items = [
    { label: 'Puntuación global', value: firstRecordedValue(entry) ?? rows[0]?.value ?? `${completeness.recorded}/${completeness.total || completeness.recorded}` },
    rows.some((row) => row.id.startsWith('imported-')) ? { label: 'Resultados importados', value: String(rows.filter((row) => row.id.startsWith('imported-')).length) } : null,
    chart.rows.length ? { label: 'Escalas graficables', value: String(chart.rows.length) } : null,
    percentiles.length ? { label: 'Percentiles', value: String(percentiles.length) } : null,
    timing.activeMs > 0 ? { label: 'Duración', value: `${Math.round(timing.activeMs / 60000)} min` } : null,
    ...distribution.filter((item) => item.count > 0).map((item) => ({ label: item.label, value: String(item.count) })),
  ].filter(Boolean)

  if (items.length === 0) return null

  return (
    <article className="dt-ai-section dt-kpi-card" aria-labelledby="kpis-title">
      <h3 id="kpis-title">Indicadores</h3>
      <dl className="dt-kpi-grid">
        {items.slice(0, 4).map((item) => (
          <div key={item!.label} title="Indicador calculado únicamente desde puntuaciones registradas.">
            <dt>{item!.label}</dt>
            <dd>{item!.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

export function ScaleProfileChart({ entry, chart }: { entry: EvaluationInstrument; chart: InstrumentProfileChart }) {
  if (chart.rows.length === 0) return null
  return (
    <article className="dt-ai-section" id="perfil-escalas" aria-labelledby="perfil-escalas-title">
      <div className="dt-ai-section-head">
        <div>
          <BarChart3 aria-hidden="true" />
          <div>
            <h3 id="perfil-escalas-title">Perfil de barras</h3>
            <p>Valor, referencia y clasificación por escala representable.</p>
          </div>
        </div>
      </div>
      <ProfileChart chart={chart} title={`Perfil de barras - ${entry.name}`} />
    </article>
  )
}

export function PercentileBandChart({ rows }: { rows: ProfileRow[] }) {
  if (rows.length === 0) return null
  return (
    <article className="dt-ai-section" aria-labelledby="percentiles-title">
      <div className="dt-ai-section-head">
        <div>
          <LineChart aria-hidden="true" />
          <div>
            <h3 id="percentiles-title">Bandas percentilares</h3>
            <p>Percentiles declarados por baremos confirmados.</p>
          </div>
        </div>
      </div>
      <ol className="dt-percentile-chart">
        {rows.map((row) => (
          <li key={row.id} title={`${row.label}: P${row.percentile} - ${row.bandLabel}. Percentil leído desde baremo confirmado.`}>
            <span>{row.label}</span>
            <strong>P{row.percentile}</strong>
            <div aria-hidden="true">
              <i style={{ left: `${Math.max(0, Math.min(100, row.percentile ?? 0))}%` }} />
            </div>
            <small>{row.bandLabel}</small>
          </li>
        ))}
      </ol>
    </article>
  )
}

export function RadarProfileChart({ chart }: { chart: InstrumentProfileChart }) {
  if (!radarEligible(chart)) return null
  return (
    <article className="dt-ai-section dt-result-helper-card" aria-labelledby="radar-title">
      <div>
        <Radar aria-hidden="true" />
        <div>
          <h3 id="radar-title">Radar disponible</h3>
          <p>El perfil incluye tres o mas medidas comparables; active la vista Radar en el grafico principal.</p>
        </div>
      </div>
    </article>
  )
}

export function SubtestComparisonChart({ rows }: { rows: ScoreRow[] }) {
  const grouped = rows.filter((row) => row.group)
  if (grouped.length < 2) return null
  return (
    <article className="dt-ai-section" aria-labelledby="subtests-title">
      <div className="dt-ai-section-head">
        <div>
          <Table2 aria-hidden="true" />
          <div>
            <h3 id="subtests-title">Comparación de subtests</h3>
            <p>Subtests con puntuaci?n real registrada.</p>
          </div>
        </div>
      </div>
      <ol className="dt-subtest-bars">
        {grouped.map((row) => (
          <li key={row.id}>
            <span>{row.label}</span>
            <div aria-hidden="true">
              <i
                style={{ width: `${Math.max(row.ratio * 100, 2)}%` }}
                title={`${row.label}: ${row.value}. ${row.classification}`}
              />
            </div>
            <strong>{row.value}</strong>
          </li>
        ))}
      </ol>
    </article>
  )
}

export function NormDistributionChart({ chart }: { chart: InstrumentProfileChart }) {
  const distribution = bandDistribution(chart.rows).filter((item) => item.count > 0)
  if (distribution.length === 0) return null
  return (
    <article className="dt-ai-section" aria-labelledby="distribucion-title">
      <h3 id="distribucion-title">Distribución por clasificación</h3>
      <ul className="dt-result-distribution">
        {distribution.map((item) => (
          <li key={item.band}>
            <strong>{item.count}</strong>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}

export function LongitudinalResultChart({
  entry,
  battery,
  blueprints,
}: {
  entry: EvaluationInstrument
  battery: EvaluationInstrument[]
  blueprints: Parameters<typeof scoreFieldsFor>[1]
}) {
  const pair = comparisonPairs(battery).find((item) => item.instrumentId === entry.instrumentId)
  if (!pair) return null
  const fields = scoreFieldsFor(entry, blueprints)
  const rows = fields
    .map((field) => ({
      id: field.id,
      label: field.subtestLabel ?? field.label,
      before: Number(pair.before.entry.scores[field.id]?.value),
      after: Number(pair.after.entry.scores[field.id]?.value),
    }))
    .filter((row) => Number.isFinite(row.before) && Number.isFinite(row.after))
  if (rows.length === 0) return null
  return (
    <article className="dt-ai-section" aria-labelledby="evolucion-title">
      <h3 id="evolucion-title">Evolución histórica</h3>
      <ol className="dt-longitudinal-list">
        {rows.map((row) => (
          <li key={row.id}>
            <span>{row.label}</span>
            <strong>
              {row.before} {'->'} {row.after}
            </strong>
          </li>
        ))}
      </ol>
    </article>
  )
}

export function ScoreTable({ rows }: { rows: ScoreRow[] }) {
  if (rows.length === 0) return null
  return (
    <article className="dt-ai-section" aria-labelledby="tabla-puntuaciones-title">
      <h3 id="tabla-puntuaciones-title">Tabla de puntuaciones</h3>
      <div className="dt-table-wrap dt-scroll">
        <table className="dt-table" data-compact="true">
          <thead>
            <tr>
              <th>Escala</th>
              <th>Puntuacion</th>
              <th>Percentil</th>
              <th>Referencia</th>
              <th>Clasificacion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.label}</td>
                <td>{row.value}</td>
                <td>{row.percentile !== null ? `P${row.percentile}` : 'No registrado'}</td>
                <td>{row.reference}</td>
                <td>{row.classification}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  )
}

export function StatisticsTable({
  entry,
  fields,
  chart,
}: {
  entry: EvaluationInstrument
  fields: ScoreField[]
  chart: InstrumentProfileChart
}) {
  const completeness = scoreCompleteness(entry, fields)
  const stats = [
    ['Puntuaciones registradas', String(completeness.recorded)],
    ['Puntuaciones pendientes', String(completeness.missing.length)],
    ['Medidas graficables', String(chart.rows.length)],
    ['Medidas sin escala declarada', String(chart.withoutScale)],
  ].filter(([, value]) => value !== '0')

  if (stats.length === 0) return null

  return (
    <details className="dt-ai-section dt-stat-disclosure" id="estadisticas">
      <summary id="estadisticas-title">Ver estadísticas completas</summary>
      <dl className="dt-stat-table">
        {stats.map(([label, value]) => (
          <div key={label} title="Estadística derivada de campos registrados; no contiene estimaciones.">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

export function InterpretationPanel({ narrative }: { narrative: InstrumentNarrative }) {
  return <NarrativePanel id="interpretacion" title="Interpretación" narrative={narrative} />
}

export function ConclusionPanel({ narrative }: { narrative: InstrumentNarrative }) {
  return <NarrativePanel id="conclusiones" title="Conclusiones" narrative={narrative} />
}

function NarrativePanel({ id, title, narrative }: { id: string; title: string; narrative: InstrumentNarrative }) {
  if (!narrative.text.trim()) return null
  return (
    <article className="dt-ai-section" id={id}>
      <div className="dt-ai-section-head">
        <div>
          <FileText aria-hidden="true" />
          <div>
            <h3>{title}</h3>
            <p>{narrative.status === 'APPROVED' ? 'Texto aprobado' : 'Texto pendiente de revisión profesional'}</p>
          </div>
        </div>
      </div>
      <div className="dt-ai-generated-text">
        <p>{narrative.text}</p>
      </div>
    </article>
  )
}

export function RecommendationPanel({ orientations }: { orientations: InstrumentOrientation[] }) {
  const items = orientations.filter((item) => item.text.trim())
  if (items.length === 0) return null
  return (
    <article className="dt-ai-section" id="recomendaciones" aria-labelledby="recomendaciones-title">
      <h3 id="recomendaciones-title">Recomendaciones</h3>
      <ul className="dt-orientations">
        {items.map((item) => (
          <li key={item.id} data-status={item.status}>
            <p>{item.text}</p>
          </li>
        ))}
      </ul>
    </article>
  )
}

export function EvidenceDrawer({ pkg }: { pkg?: InstrumentPackage }) {
  if (!pkg || (pkg.findings.length === 0 && pkg.files.length === 0)) return null
  return (
    <details className="dt-ai-section dt-evidence-drawer">
      <summary>Evidencia del an?lisis</summary>
      <ul>
        {pkg.findings.slice(0, 6).map((finding) => (
          <li key={finding.id}>
            <strong>{finding.field}</strong>
            <span>{finding.value}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

export function InstrumentReportCard({ entry }: { entry: EvaluationInstrument }) {
  const approved = entry.report.status === 'APPROVED'
  return (
    <article className="dt-ai-section" id="informe" aria-labelledby="informe-title">
      <div className="dt-ai-section-head">
        <div>
          <FileText aria-hidden="true" />
          <div>
            <h3 id="informe-title">Informe</h3>
            <p>
              {approved
                ? 'Informe aprobado y listo para descarga.'
                : entry.report.status === 'NOT_READY'
                  ? 'Informe técnico preliminar disponible con los resultados válidos actuales.'
                  : 'Borrador listo para revisión profesional.'}
            </p>
          </div>
        </div>
      </div>
      <div className="dt-ai-actions">
        <button type="button" className="dt-btn dt-btn-secondary dt-btn-sm">
          Vista previa
        </button>
        {!approved && entry.report.status !== 'NOT_READY' ? (
          <button type="button" className="dt-btn dt-btn-primary dt-btn-sm">
            Aprobar
          </button>
        ) : approved ? (
          <button type="button" className="dt-btn dt-btn-primary dt-btn-sm">
            Descargar PDF
          </button>
        ) : null}
      </div>
    </article>
  )
}

type ScoreRow = {
  id: string
  label: string
  group: string | null
  value: string
  ratio: number
  percentile: number | null
  reference: string
  classification: string
}

function scoreRows(entry: EvaluationInstrument, fields: ScoreField[], chart: InstrumentProfileChart): ScoreRow[] {
  return fields
    .map((field) => {
      const raw = entry.scores[field.id]?.value?.trim()
      if (!raw) return null
      const chartRow = chart.rows.find((row) => row.id === field.id)
      return {
        id: field.id,
        label: field.subtestLabel ?? field.label,
        group: field.subtestLabel,
        value: chartRow?.caption ?? raw,
        ratio: chartRow?.ratio ?? 0,
        percentile: chartRow?.percentile ?? null,
        reference: field.unit || 'No registrado',
        classification: chartRow?.bandLabel ?? 'No registrado',
      }
    })
    .filter((row): row is ScoreRow => row !== null)
}

function importedResultRows(pkg?: InstrumentPackage): ScoreRow[] {
  if (!pkg?.computedResults?.length) return []

  return pkg.computedResults
    .map((result): ScoreRow | null => {
      const value = result.rawValue ?? result.transformedValue ?? result.classification ?? null
      if (!value && result.percentile === null) return null
      return {
        id: `imported-${result.measureId}-${result.sourceLocation ?? result.sourceFile}`,
        label: `${result.label} importado`,
        group: null,
        value: value ?? `P${result.percentile}`,
        ratio: 0,
        percentile: result.percentile,
        reference: result.sourceLocation ? `${result.sourceFile} · ${result.sourceLocation}` : result.sourceFile,
        classification: result.classification ?? 'Resultado importado',
      }
    })
    .filter((row): row is ScoreRow => row !== null)
}

function firstRecordedValue(entry: EvaluationInstrument) {
  return Object.values(entry.scores).find((score) => score.value.trim())?.value.trim() ?? null
}
