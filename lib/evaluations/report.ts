import { backgroundSchema, fieldKey } from '@/lib/evaluations/background-schema'
import { functionalAreaSchema } from '@/lib/evaluations/functional-areas'
import { ageAt, formatAge, formatLongDate, orDash } from '@/lib/evaluations/format'
import { acceptedConclusions } from '@/lib/evaluations/conclusion-evidence'
import { recommendationGroupIds, recommendationGroupLabels, type Evaluation } from '@/lib/evaluations/model'
import { evaluationResults } from '@/lib/evaluations/results'
import { acceptedFiles, packageFileRoleLabels, type InstrumentPackage } from '@/lib/instruments/import/package-model'
import { buildAreaDistributionVisualization } from '@/lib/instruments/instrument-visualizations'
import { buildEvaluationAnalytics, findPackageForInstrument } from '@/lib/evaluations/analytics/build-evaluation-analytics'
import { chartAreaFallback, type ChartAreaFallback } from '@/lib/evaluations/analytics/build-instrument-analytics'
import type { EvaluationAnalytics, EvaluationAnalyticsSummary } from '@/lib/evaluations/analytics/types'

export type ReportBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'note'; title: string; text: string; items?: string[] }
  | { kind: 'pairs'; items: Array<{ label: string; value: string }> }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][]; caption?: string }
  | {
      kind: 'kpi-grid'
      items: Array<{ label: string; value: string; detail?: string; tone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' }>
    }
  | {
      kind: 'chart'
      type?: 'bar' | 'percentile' | 'donut' | 'flow' | 'gauge' | 'matrix' | 'stacked'
      title: string
      unit: string
      source: string
      insight?: string
      maxValue?: number
      values: Array<{ label: string; value: number; caption?: string; source?: string }>
    }
  | { kind: 'subheading'; text: string }

export type ReportSection = {
  number: number
  title: string
  blocks: ReportBlock[]
}

export type ReportDocument = {
  title: string
  subject: string
  code: string
  date: string
  summary: Array<{ label: string; value: string }>
  sections: ReportSection[]
}

export type ReportInstrumentSummary = {
  id: string
  name: string
  description: string
  status: string
  applicability: string
  sourceCount: number
  materials: string[]
  /** Confianza de extracción y cobertura de respuestas, o "No disponible" si el instrumento no las declara. */
  kpis: Array<{ label: string; value: string }>
  results: Array<{
    scale: string
    rawScore: string
    transformedScore: string
    percentile: string
    interpretation: string
    source: string
  }>
  charts: Array<Extract<ReportBlock, { kind: 'chart' }>>
  /** Cuando no hay gráfico, qué mostrar en su lugar — mismo texto que Step 7 para el mismo caso. */
  chartFallback: ChartAreaFallback | null
  interpretationSummary: string
  interpretationFindings: string[]
  evidence: string[]
  limitations: string[]
}

const EMPTY = 'No registrado.'
const NOT_AVAILABLE = 'No disponible en el material importado.'

export function getReportInstrumentSummary(evaluation: Evaluation): ReportInstrumentSummary[] {
  return buildInstrumentSummaries(buildEvaluationAnalytics(evaluation), evaluation)
}

/**
 * Misma fuente que Step 7: status, aplicabilidad, materiales, fuentes,
 * gráficos y limitaciones salen de un único cálculo de `analytics`, no de uno
 * propio del informe. `buildReport` pasa el `analytics` que ya calculó una
 * vez, para no recorrer los paquetes por segunda vez en el mismo documento.
 */
function buildInstrumentSummaries(analytics: EvaluationAnalytics, evaluation: Evaluation): ReportInstrumentSummary[] {
  const summaries = new Map<string, ReportInstrumentSummary>()

  for (const instrument of analytics.instruments) {
    const pkg = findPackageForInstrument(evaluation.instrumentPackages, instrument.id)
    summaries.set(instrument.id, {
      id: instrument.id,
      name: cleanInstrumentName(instrument.name),
      description: descriptionFromPackage(pkg) || 'Instrumento digitalizado por Detection AI.',
      status: instrument.statusLabel,
      applicability: instrument.applicabilityLabel,
      sourceCount: instrument.sourceCount,
      materials: instrument.materials,
      kpis: instrumentKpiPairs(instrument),
      results: instrument.results.map((result) => ({
        scale: result.label,
        rawScore: result.value,
        transformedScore: NOT_AVAILABLE,
        percentile: /^P\d+/i.test(result.value) ? result.value : NOT_AVAILABLE,
        interpretation: instrument.status === 'NORMATIVE_READY' ? 'Resultado normativo disponible.' : 'Descriptivo verificable.',
        source: result.source,
      })),
      charts: instrument.charts.map((chart) => ({
        kind: 'chart' as const,
        type: chart.type,
        title: chart.title,
        unit: chart.unit,
        source: chart.source,
        maxValue: chart.maxValue,
        values: chart.values.slice(0, 12).map((point) => ({
          label: point.label,
          value: point.value,
          caption: point.caption,
          source: point.source,
        })),
      })),
      chartFallback: chartAreaFallback({
        hasCharts: instrument.charts.length > 0,
        results: instrument.results,
        materials: instrument.materials,
        detectedResponses: instrument.responseCoverage.detected,
      }),
      interpretationSummary: instrument.interpretationSummary,
      interpretationFindings: instrument.interpretationFindings,
      evidence: instrument.evidence,
      limitations: instrument.limitations,
    })
  }

  for (const pkg of evaluation.instrumentPackages) {
    if (summaries.has(pkg.id)) continue
    const files = acceptedFiles(pkg)
    const orphanCharts = chartFromImportedResults(pkg)
    summaries.set(pkg.id, {
      id: pkg.id,
      name: cleanInstrumentName(pkg.name || pkg.fingerprint.acronym || pkg.instrumentIdentity.acronym || 'Instrumento digitalizado'),
      description: descriptionFromPackage(pkg) || 'Material instrumental incorporado al expediente.',
      status: pkg.computedResults.length > 0 ? 'Resultados importados' : readinessLabel(pkg.readiness),
      applicability: 'Pendiente de validación profesional',
      sourceCount: files.length,
      materials: materialLabels(pkg),
      kpis: instrumentKpiPairs({
        materials: materialLabels(pkg),
        sourceCount: files.length,
        averageConfidencePct: null,
        responseCoverage: { pct: null },
      }),
      results: pkg.computedResults.map((result) => ({
        scale: result.label,
        rawScore: result.rawValue ?? NOT_AVAILABLE,
        transformedScore: result.transformedValue ?? NOT_AVAILABLE,
        percentile: result.percentile === null ? NOT_AVAILABLE : `P${result.percentile}`,
        interpretation: result.classification ?? 'Resultado importado sin clasificación normativa.',
        source: result.sourceLocation ? `${result.sourceFile} - ${result.sourceLocation}` : result.sourceFile,
      })),
      charts: orphanCharts,
      chartFallback: chartAreaFallback({
        hasCharts: orphanCharts.length > 0,
        results: pkg.computedResults.map((result) => ({
          label: result.label,
          value: result.transformedValue ?? result.rawValue ?? '',
        })),
        materials: materialLabels(pkg),
        detectedResponses: (pkg.extractedResponses ?? []).reduce((sum, set) => sum + set.responses.length, 0),
      }),
      interpretationSummary: '',
      interpretationFindings: [],
      evidence: files.map((file) => file.name),
      limitations: pkg.errorMessage ? [pkg.errorMessage] : [],
    })
  }

  return [...summaries.values()].filter((summary) => summary.sourceCount > 0 || summary.results.length > 0)
}

/**
 * Cuatro cifras reales por instrumento — materiales y fuentes ya se conocían;
 * confianza y cobertura se muestran como "No disponible" cuando el
 * instrumento no las declara, nunca como 0.
 */
function instrumentKpiPairs(instrument: {
  materials: string[]
  sourceCount: number
  averageConfidencePct: number | null
  responseCoverage: { pct: number | null }
}): Array<{ label: string; value: string }> {
  return [
    { label: 'Materiales analizados', value: String(instrument.materials.length) },
    { label: 'Fuentes', value: String(instrument.sourceCount) },
    {
      label: 'Confianza de extracción',
      value: instrument.averageConfidencePct === null ? 'No disponible' : `${instrument.averageConfidencePct}%`,
    },
    {
      label: 'Cobertura',
      value: instrument.responseCoverage.pct === null ? 'No disponible' : `${instrument.responseCoverage.pct}%`,
    },
  ]
}

/**
 * Composición ejecutiva compacta de los KPIs del expediente completo, para
 * abrir la sección de resultados. Sale entera de `EvaluationAnalyticsSummary`
 * — nada se recalcula aquí. Un indicador que no existe de verdad (cobertura,
 * confianza) se imprime como "No disponible", nunca como 0.
 */
function buildResultsKpiBlock(summary: EvaluationAnalyticsSummary): ReportBlock {
  const pct = (value: number | null) => (value === null ? 'No disponible' : `${value}%`)
  const completionPct = summary.instrumentCount ? Math.round((summary.instrumentsWithResults / summary.instrumentCount) * 100) : null
  return {
    kind: 'kpi-grid',
    items: [
      {
        label: 'Avance instrumental',
        value: pct(completionPct),
        detail: `${summary.instrumentsWithResults} de ${summary.instrumentCount} instrumentos con resultados`,
        tone: completionPct === 100 ? 'success' : summary.instrumentsWithResults > 0 ? 'primary' : 'warning',
      },
      {
        label: 'Resultados válidos',
        value: String(summary.resultCount),
        detail: `${summary.normativeInstrumentCount} normativos · ${summary.descriptiveInstrumentCount} descriptivos`,
        tone: summary.resultCount > 0 ? 'success' : 'warning',
      },
      {
        label: 'Material procesado',
        value: String(summary.processedFiles),
        detail: `${summary.packageCount} paquetes · ${summary.chartableInstrumentCount} con gráfico`,
        tone: summary.processedFiles > 0 ? 'primary' : 'neutral',
      },
      {
        label: 'Calidad del dato',
        value: pct(summary.dataQualityPct),
        detail: `Confianza ${pct(summary.averageConfidencePct)} · Evidencia ${pct(summary.evidenceCoveragePct)}`,
        tone: summary.dataQualityPct === null ? 'neutral' : summary.dataQualityPct >= 80 ? 'success' : summary.dataQualityPct >= 60 ? 'primary' : 'warning',
      },
      {
        label: 'Cobertura de respuestas',
        value: pct(summary.coveragePct),
        detail: `${summary.validResponses} válidas de ${summary.detectedResponses} detectadas`,
        tone: summary.coveragePct === null ? 'neutral' : summary.coveragePct >= 80 ? 'success' : 'warning',
      },
      {
        label: 'Aplicabilidad',
        value: `${summary.applicableInstrumentCount}/${summary.instrumentCount}`,
        detail: `${summary.nonApplicableInstrumentCount} fuera de rango · ${summary.unknownApplicabilityCount} por validar`,
        tone: summary.nonApplicableInstrumentCount > 0 || summary.unknownApplicabilityCount > 0 ? 'warning' : 'success',
      },
      {
        label: 'Limitaciones',
        value: String(summary.limitationCount),
        detail: summary.limitationCount > 0 ? 'Requieren lectura profesional' : 'Sin limitaciones registradas',
        tone: summary.limitationCount > 0 ? 'warning' : 'success',
      },
      {
        label: 'Evidencia aceptada',
        value: pct(summary.evidenceCoveragePct),
        detail: `${summary.processedFiles} archivos incorporados`,
        tone: summary.evidenceCoveragePct === null ? 'neutral' : summary.evidenceCoveragePct >= 80 ? 'success' : 'warning',
      },
    ],
  }
}

export function buildReport(evaluation: Evaluation): ReportDocument {
  const { initialData } = evaluation
  const age = ageAt(initialData.person.birthDate, initialData.evaluationDate)
  const legacyResults = evaluationResults(evaluation)
  // Un único cálculo para todo el documento: KPIs, instrumentos, gráficos y
  // limitaciones de esta sección salen todos de aquí.
  const analytics = buildEvaluationAnalytics(evaluation)
  const reportInstruments = buildInstrumentSummaries(analytics, evaluation)
  const appliedInstrumentNames = reportInstruments.length
    ? reportInstruments.map((instrument) => instrument.name)
    : legacyResults.map((result) => result.instrument.nombre)

  const professional = evaluation.report.professional
  const conclusions = acceptedConclusions(evaluation).map((entry) => entry.text.trim()).filter(Boolean)
  const recommendationBlocks = buildRecommendationBlocks(evaluation)
  // "Resultados estadísticos" promete numeros que no siempre existen: si
  // ningun instrumento tiene resultados puntuables, el titulo pasa a describir
  // lo que de verdad hay - interpretacion, no estadistica.
  const hasQuantitativeResults =
    reportInstruments.some((instrument) => instrument.results.length > 0) ||
    legacyResults.some((result) => result.rows.some((row) => row.pd !== null))
  const resultsSectionTitle = hasQuantitativeResults
    ? 'Resultados estadísticos'
    : 'Resultados e interpretación de instrumentos'

  const sections: ReportSection[] = [
    {
      number: 1,
      title: 'Datos de identificación',
      blocks: [
        {
          kind: 'pairs',
          items: [
            { label: 'Nombres y apellidos', value: orDash(initialData.person.fullName, EMPTY) },
            { label: 'Fecha de nacimiento', value: formatLongDate(initialData.person.birthDate) },
            { label: 'Edad', value: age ? formatAge(age) : EMPTY },
            { label: 'Sexo', value: orDash(initialData.person.sex, 'Sin especificar') },
            { label: 'Identificación', value: orDash(initialData.person.identification, EMPTY) },
            { label: 'Institución educativa', value: orDash(initialData.person.institution, EMPTY) },
            { label: 'Grado o curso', value: orDash(initialData.person.grade, EMPTY) },
            { label: 'Docente tutor', value: orDash(initialData.person.tutor, EMPTY) },
            { label: 'Representante', value: orDash(initialData.family.guardianName, EMPTY) },
            { label: 'Teléfono', value: orDash(initialData.family.guardianPhone, EMPTY) },
            { label: 'Correo electrónico', value: orDash(initialData.family.guardianEmail, EMPTY) },
          ],
        },
      ],
    },
    {
      number: 2,
      title: 'Motivo de evaluación',
      blocks: [
        { kind: 'paragraph', text: orDash(evaluation.referral.reason, EMPTY) },
        {
          kind: 'pairs',
          items: [
            { label: 'Remitente', value: orDash(evaluation.referral.source, EMPTY) },
            { label: 'Oficio o referencia', value: orDash(evaluation.referral.officeNumber, EMPTY) },
            { label: 'Fecha del oficio', value: formatLongDate(evaluation.referral.officeDate) },
            { label: 'Documento de respaldo', value: orDash(evaluation.referral.documentNumber, EMPTY) },
          ],
        },
        ...(evaluation.referral.requestText.trim()
          ? [
              { kind: 'subheading' as const, text: 'Solicitud registrada' },
              { kind: 'paragraph' as const, text: evaluation.referral.requestText },
            ]
          : []),
      ],
    },
    { number: 3, title: 'Antecedentes relevantes', blocks: buildBackgroundBlocks(evaluation) },
    { number: 4, title: 'Áreas evaluadas', blocks: buildAreaBlocks(evaluation) },
    { number: 5, title: 'Instrumentos y técnicas', blocks: buildInstrumentBlocks(reportInstruments) },
    {
      number: 6,
      title: resultsSectionTitle,
      blocks: [
        ...(analytics.instruments.length > 0
          ? [
              buildResultsKpiBlock(analytics.summary),
              ...analytics.overviewCharts.map((chart) => ({
                kind: 'chart' as const,
                type: chart.type,
                title: chart.title,
                unit: chart.unit,
                source: chart.source,
                insight: chart.insight,
                maxValue: chart.maxValue,
                values: chart.values,
              })),
            ]
          : []),
        ...buildResultBlocks(reportInstruments, legacyResults),
      ],
    },
    {
      number: 7,
      title: 'Interpretación psicopedagógica',
      blocks: [{ kind: 'paragraph', text: orDash(evaluation.interpretation, EMPTY) }],
    },
    {
      number: 8,
      title: 'Conclusiones',
      blocks: conclusions.length > 0 ? [{ kind: 'list', items: conclusions }] : [{ kind: 'paragraph', text: EMPTY }],
    },
    {
      number: 9,
      title: 'Recomendaciones',
      blocks: recommendationBlocks.length > 0 ? recommendationBlocks : [{ kind: 'paragraph', text: EMPTY }],
    },
    {
      number: 10,
      title: 'Firma profesional y trazabilidad',
      blocks: [
        {
          kind: 'pairs',
          items: [
            { label: 'Nombre', value: orDash(professional.name, orDash(evaluation.evaluatorName, EMPTY)) },
            { label: 'Cargo o especialidad', value: orDash(professional.role, EMPTY) },
            ...(professional.registryNumber.trim()
              ? [{ label: 'Registro profesional', value: professional.registryNumber }]
              : []),
            { label: 'Fecha de evaluación', value: formatLongDate(initialData.evaluationDate) },
            { label: 'Fecha de emisión', value: formatLongDate(professional.date || new Date().toISOString()) },
            { label: 'Firma', value: '__________________________________' },
          ],
        },
      ],
    },
  ]

  return {
    title: 'INFORME PSICOPEDAGÓGICO',
    subject: orDash(initialData.person.fullName, 'Evaluado'),
    code: evaluation.code,
    date: formatLongDate(initialData.evaluationDate),
    summary: [
      { label: 'Evaluado', value: orDash(initialData.person.fullName, EMPTY) },
      { label: 'Edad a la evaluación', value: age ? formatAge(age) : EMPTY },
      { label: 'Institución educativa', value: orDash(initialData.person.institution, EMPTY) },
      { label: 'Grado o curso', value: orDash(initialData.person.grade, EMPTY) },
      {
        label: 'Instrumentos aplicados',
        value: appliedInstrumentNames.length > 0 ? appliedInstrumentNames.join(', ') : 'No se registraron instrumentos en el expediente.',
      },
      { label: 'Profesional responsable', value: orDash(professional.name, orDash(evaluation.evaluatorName, EMPTY)) },
    ],
    sections,
  }
}

export function reportFileName(evaluation: Evaluation) {
  const name = (evaluation.initialData.person.fullName || 'Evaluado')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `Informe_Psicopedagogico_${name}_${evaluation.code}.pdf`
}

function buildBackgroundBlocks(evaluation: Evaluation): ReportBlock[] {
  const blocks: ReportBlock[] = []
  for (const tab of backgroundSchema) {
    const values = evaluation.background[tab.id] ?? {}
    const written = tab.blocks
      .flatMap((block) => block.fields.map((field) => ({ block, field })))
      .map(({ block, field }) => ({
        label: field.label,
        value: (values[fieldKey(block.id, field.id)] ?? '').trim(),
      }))
      .filter((item) => item.value.length > 0)

    if (written.length === 0) continue
    blocks.push({ kind: 'subheading', text: tab.label })
    blocks.push({ kind: 'pairs', items: written })
  }

  if (evaluation.interventions.length > 0) {
    blocks.push({ kind: 'subheading', text: 'Intervenciones previas' })
    blocks.push({
      kind: 'table',
      headers: ['Institución', 'Especialidad', 'Documento', 'Año'],
      rows: evaluation.interventions.map((item) => [
        orDash(item.institution, EMPTY),
        orDash(item.specialty),
        orDash(item.documentType),
        orDash(item.year),
      ]),
    })
  }

  return blocks.length > 0 ? blocks : [{ kind: 'paragraph', text: EMPTY }]
}

function buildAreaBlocks(evaluation: Evaluation): ReportBlock[] {
  const observedAreas = functionalAreaSchema
    .map((area) => ({ area, record: evaluation.functionalAreas[area.id] }))
    .filter((item) => item.record?.performance || item.record?.description || item.record?.observations)

  if (observedAreas.length === 0) return [{ kind: 'paragraph', text: EMPTY }]
  const distribution = buildAreaDistributionVisualization(evaluation)
  return [
    // Los mismos conteos que alimentan la dona, también como cifras — sin
    // recalcular nada, sólo reutilizando `distribution.values`.
    ...(distribution
      ? [
          {
            kind: 'kpi-grid' as const,
            items: [
              { label: 'Áreas observadas', value: String(observedAreas.length) },
              ...distribution.values.map((value) => ({ label: value.label, value: String(value.value) })),
            ],
          },
        ]
      : []),
    {
      kind: 'table',
      headers: ['Área evaluada', 'Desempeño', 'Descripción'],
      rows: observedAreas.map(({ area, record }) => [
        area.label,
        orDash(record.performance, 'Sin valorar'),
        orDash(record.description || record.observations, EMPTY),
      ]),
    },
    ...(distribution
      ? [
          {
            kind: 'chart' as const,
            type: distribution.type,
            title: distribution.title,
            unit: distribution.unit,
            source: distribution.source,
            maxValue: distribution.maxValue,
            values: distribution.values,
          },
        ]
      : []),
  ]
}

function buildInstrumentBlocks(instruments: ReportInstrumentSummary[]): ReportBlock[] {
  if (instruments.length === 0) return [{ kind: 'paragraph', text: 'No se registraron instrumentos en el expediente.' }]
  return instruments.flatMap((instrument) => [
    { kind: 'subheading' as const, text: instrument.name },
    {
      kind: 'pairs' as const,
      items: [
        { label: 'Descripción', value: instrument.description },
        { label: 'Estado', value: instrument.status },
        { label: 'Aplicabilidad normativa', value: instrument.applicability },
        { label: 'Material analizado', value: instrument.materials.length ? instrument.materials.join(', ') : EMPTY },
        { label: 'Fuentes', value: `${instrument.sourceCount} archivo${instrument.sourceCount === 1 ? '' : 's'}` },
      ],
    },
  ])
}

function buildResultBlocks(
  instruments: ReportInstrumentSummary[],
  legacyResults: ReturnType<typeof evaluationResults>,
): ReportBlock[] {
  const blocks: ReportBlock[] = []

  for (const instrument of instruments) {
    // Cabecera → 4 KPI → visualización principal (gráfico real o estado
    // compacto) → tabla → interpretación → evidencia → motivo. Mismo orden
    // que arma InstrumentChartArea/ImportedResultPanel en Step 7.
    blocks.push({ kind: 'subheading', text: instrument.name })
    blocks.push({
      kind: 'pairs',
      items: [
        { label: 'Estado', value: instrument.status },
        { label: 'Aplicabilidad', value: instrument.applicability },
      ],
    })
    blocks.push({ kind: 'kpi-grid', items: instrument.kpis })

    if (instrument.charts.length > 0) {
      for (const chart of instrument.charts) blocks.push(chart)
    } else if (instrument.chartFallback) {
      blocks.push({ kind: 'note', title: instrument.chartFallback.title, text: instrument.chartFallback.text })
    }

    if (instrument.results.length > 0) {
      blocks.push({
        kind: 'table',
        headers: ['Escala', 'PD/Valor', 'Transformada', 'Percentil', 'Interpretación'],
        caption: `Resultados disponibles en ${instrument.name}.`,
        rows: instrument.results.map((result) => [
          result.scale,
          result.rawScore,
          result.transformedScore,
          result.percentile,
          result.interpretation,
        ]),
      })
    }

    if (instrument.interpretationSummary.trim()) {
      blocks.push({ kind: 'subheading', text: 'Interpretación' })
      blocks.push({ kind: 'paragraph', text: instrument.interpretationSummary })
      if (instrument.interpretationFindings.length > 0) blocks.push({ kind: 'list', items: instrument.interpretationFindings })
    }

    blocks.push({
      kind: 'pairs',
      items: [
        {
          label: 'Evidencia y trazabilidad',
          value: instrument.evidence.length > 0 ? instrument.evidence.join(', ') : 'Sin archivos de evidencia registrados.',
        },
      ],
    })

    if (instrument.limitations.length > 0) blocks.push({ kind: 'note', title: 'Motivo', text: '', items: instrument.limitations })
  }

  for (const result of legacyResults.filter(
    (legacy) => !instruments.some((instrument) => instrument.name === legacy.instrument.nombre),
  )) {
    const isPdPt = result.instrument.scoringMode === 'pd_pt'
    blocks.push({ kind: 'subheading', text: result.instrument.nombre })
    blocks.push({
      kind: 'table',
      headers: isPdPt
        ? [result.instrument.unidad.singular, 'PD', 'PT', 'Clasificación']
        : [result.instrument.unidad.singular, 'Area', 'PD', 'Máximo'],
      caption: `Resultados registrados en ${result.instrument.nombre}.`,
      rows: result.rows.map((row) =>
        isPdPt
          ? [
              row.nombre,
              row.pd === null ? NOT_AVAILABLE : String(row.pd),
              row.pt === null ? NOT_AVAILABLE : String(row.pt),
              row.classification ?? 'Conversión no disponible',
            ]
          : [row.nombre, row.area, row.pd === null ? NOT_AVAILABLE : String(row.pd), String(row.max)],
      ),
    })
    if (result.notices.length > 0) blocks.push({ kind: 'list', items: result.notices })
  }

  return blocks.length > 0 ? blocks : [{ kind: 'paragraph', text: EMPTY }]
}

function buildRecommendationBlocks(evaluation: Evaluation): ReportBlock[] {
  const blocks: ReportBlock[] = []
  for (const group of recommendationGroupIds) {
    const items = evaluation.recommendations[group]
      .filter((entry) => entry.status !== 'AI_DRAFT' && entry.status !== 'DISCARDED')
      .map((entry) => entry.text.trim())
      .filter(Boolean)
    if (items.length === 0) continue
    // Un cuadro por destinatario, no una lista corrida: así se distingue de un
    // vistazo a quién le corresponde cada recomendación.
    blocks.push({ kind: 'note', title: recommendationGroupLabels[group], text: '', items })
  }
  return blocks
}

function cleanInstrumentName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function descriptionFromPackage(pkg?: InstrumentPackage) {
  if (!pkg) return ''
  const wanted = ['nombre', 'descripcion', 'descripción', 'objetivo', 'aplicacion', 'aplicación']
  return pkg.findings.find((finding) => wanted.some((field) => finding.field.toLowerCase().includes(field)))?.value ?? ''
}

function materialLabels(pkg?: InstrumentPackage) {
  if (!pkg) return []
  const labels = new Set<string>()
  for (const file of acceptedFiles(pkg)) labels.add(packageFileRoleLabels[file.role] ?? 'Material')
  return [...labels]
}

function readinessLabel(readiness: InstrumentPackage['readiness']) {
  switch (readiness) {
    case 'READY':
      return 'Listo para uso'
    case 'PARTIAL_READY':
      return 'Análisis parcial disponible'
    case 'INSUFFICIENT_DATA':
      return 'Datos insuficientes'
    case 'REQUIRES_REVIEW':
      return 'Revisión requerida'
    case 'PARTIALLY_STRUCTURED':
      return 'Parcialmente estructurado'
    case 'SUPPORT_MATERIAL_ONLY':
      return 'Solo material de respaldo'
    case 'FAILED':
      return 'Procesamiento detenido'
  }
}

function chartFromImportedResults(pkg: InstrumentPackage): ReportInstrumentSummary['charts'] {
  const values = pkg.computedResults
    .map((result) => ({ label: result.label, value: Number(result.transformedValue ?? result.rawValue ?? result.percentile) }))
    .filter((result) => Number.isFinite(result.value))
    .slice(0, 12)

  if (values.length === 0) return []
  return [
    {
      kind: 'chart',
      type: 'bar',
      title: `Perfil de resultados - ${cleanInstrumentName(pkg.name || pkg.fingerprint.acronym || 'Instrumento')}`,
      unit: 'Valor importado',
      source: pkg.computedResults[0]?.sourceFile ?? 'Instrumentos IA',
      maxValue: Math.max(...values.map((item) => item.value), 1),
      values,
    },
  ]
}
