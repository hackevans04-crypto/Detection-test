import { completedAreas } from '@/lib/evaluations/functional-areas'
import { buildEvaluationContext } from '@/lib/evaluations/context-service'
import type { Evaluation, EvaluationInstrument, InstrumentBlueprint } from '@/lib/evaluations/model'
import { applicationModeLabels } from '@/lib/evaluations/model'
import { batterySummary, sortedBattery } from '@/lib/instruments/battery'
import { instrumentProfileChart } from '@/lib/instruments/charts'
import {
  buildEvidenceMatrix,
  convergenceLabels,
  evidenceDirectionLabels,
  evidenceHighlights,
  evidenceLevelLabels,
  type EvidenceRow,
} from '@/lib/instruments/evidence-matrix'
import { formatDuration, sessionTiming } from '@/lib/instruments/session-timing'

/**
 * Síntesis integral de la evaluación.
 *
 * Reúne los pasos 1 a 5 con toda la batería para dar una lectura del expediente
 * completo. No es un diagnóstico ni pretende serlo: es la revisión ordenada de
 * lo que hay, con la evidencia de cada afirmación a la vista y las discrepancias
 * señaladas en vez de disimuladas.
 *
 * El material que sale de aquí es también lo único que puede llegar a un modelo:
 * datos del expediente ya registrados, resultados validados y hallazgos de la
 * matriz. Ni el archivo original de un respaldo, ni notas ajenas al caso, ni el
 * expediente entero por si acaso.
 */

export type SynthesisSection = {
  id: string
  title: string
  /** Hechos verificables, extraídos del expediente. */
  facts: string[]
  /** `true` cuando la sección necesita una redacción profesional. */
  needsNarrative: boolean
}

export type SynthesisMaterial = {
  sections: SynthesisSection[]
  matrix: EvidenceRow[]
  highlights: ReturnType<typeof evidenceHighlights>
  /** Qué falta para que la síntesis se sostenga. */
  gaps: string[]
}

function instrumentLine(entry: EvaluationInstrument, blueprints: Record<string, InstrumentBlueprint>) {
  const timing = sessionTiming(entry.events)
  const chart = instrumentProfileChart(entry, blueprints)
  const duration = timing.activeMs > 0 ? formatDuration(timing.activeMs) : 'sin tiempo registrado'
  const measures = chart.rows.length > 0 ? `${chart.rows.length} medidas representables` : 'sin medidas representables'
  const validated = entry.report.status === 'APPROVED' ? 'informe aprobado' : 'informe pendiente de aprobación'
  return `${entry.name} · ${applicationModeLabels[entry.applicationMode]} · ${duration} · ${measures} · ${validated}`
}

export function buildSynthesisMaterial(
  evaluation: Evaluation,
  blueprints: Record<string, InstrumentBlueprint>,
): SynthesisMaterial {
  const context = buildEvaluationContext(evaluation)
  const battery = sortedBattery(evaluation.battery)
  const summary = batterySummary(evaluation.battery)
  const matrix = buildEvidenceMatrix(evaluation, blueprints)
  const highlights = evidenceHighlights(matrix)
  const areas = completedAreas(evaluation)

  const sections: SynthesisSection[] = [
    {
      id: 'caso',
      title: 'Síntesis del caso',
      facts: [
        `Evaluado: ${evaluation.initialData.person.fullName || 'sin registrar'}.`,
        `Edad cronológica: ${context.person.chronologicalAge.value ?? 'sin registrar'}.`,
        `Escolaridad: ${context.academic.currentLevel.value ?? 'sin registrar'}.`,
      ],
      needsNarrative: true,
    },
    {
      id: 'motivo',
      title: 'Motivo y contexto relevante',
      facts: [
        evaluation.referral.reason.trim() || 'Motivo de evaluación sin registrar.',
        `Remitente: ${evaluation.referral.source.trim() || 'sin registrar'}.`,
        `Secciones de contexto registradas: ${context.context.availableSections.value?.length ?? 0}.`,
      ],
      needsNarrative: false,
    },
    {
      id: 'areas',
      title: 'Áreas evaluadas',
      facts:
        areas.length > 0
          ? areas.map((area) => `${area.label}: ${evaluation.functionalAreas[area.id]?.performance || 'sin valorar'}.`)
          : ['Ninguna área funcional explorada.'],
      needsNarrative: false,
    },
    {
      id: 'instrumentos',
      title: 'Instrumentos utilizados',
      facts:
        battery.length > 0
          ? battery.map((entry) => instrumentLine(entry, blueprints))
          : ['La batería no contiene instrumentos.'],
      needsNarrative: false,
    },
    {
      id: 'cuantitativos',
      title: 'Resultados cuantitativos',
      facts: [
        `${summary.completed} de ${summary.planned} instrumentos finalizados.`,
        `${summary.withResults} instrumentos con medidas registradas.`,
        `Tiempo total de aplicación: ${summary.totalDurationMs > 0 ? formatDuration(summary.totalDurationMs) : 'sin registrar'}.`,
      ],
      needsNarrative: false,
    },
    {
      id: 'cualitativos',
      title: 'Resultados cualitativos',
      facts: (() => {
        const notes = battery.flatMap((entry) =>
          entry.log.filter((item) => item.kind === 'OBSERVATION' || item.kind === 'BEHAVIOUR'),
        )
        return notes.length > 0
          ? notes.slice(0, 12).map((item) => item.note)
          : ['Sin observaciones registradas durante las aplicaciones.']
      })(),
      needsNarrative: false,
    },
    {
      id: 'convergencia',
      title: 'Convergencia de evidencia',
      facts:
        highlights.convergences.length > 0
          ? highlights.convergences.map(
              (row) => `${row.area}: ${row.sources.length} fuentes coinciden en ${evidenceDirectionLabels[row.direction].toLowerCase()}.`,
            )
          : ['Ninguna área cuenta todavía con dos fuentes coincidentes.'],
      needsNarrative: false,
    },
    {
      id: 'discrepancias',
      title: 'Discrepancias',
      facts:
        highlights.discrepancies.length > 0
          ? highlights.discrepancies.map(
              (row) =>
                `${row.area}: ${row.sources.map((source) => `${source.label} (${evidenceDirectionLabels[source.direction].toLowerCase()})`).join(' frente a ')}.`,
            )
          : ['No se identifican discrepancias entre las fuentes disponibles.'],
      needsNarrative: true,
    },
    {
      id: 'fortalezas',
      title: 'Fortalezas identificadas',
      facts:
        highlights.strengths.length > 0
          ? highlights.strengths.map((row) => `${row.area}.`)
          : ['Sin fortalezas sostenidas por la evidencia disponible.'],
      needsNarrative: false,
    },
    {
      id: 'atencion',
      title: 'Áreas que requieren atención',
      facts:
        highlights.difficulties.length > 0
          ? highlights.difficulties.map((row) => `${row.area} · ${convergenceLabels[row.convergence].toLowerCase()}.`)
          : ['Sin áreas de dificultad sostenidas por la evidencia disponible.'],
      needsNarrative: false,
    },
    {
      id: 'limitaciones',
      title: 'Limitaciones de la evaluación',
      facts: (() => {
        const limits: string[] = []
        if (highlights.insufficient.length > 0) {
          limits.push(
            `${highlights.insufficient.length} áreas sin evidencia: ${highlights.insufficient.map((row) => row.area).join(', ')}.`,
          )
        }
        if (summary.awaitingReview > 0) {
          limits.push(`${summary.awaitingReview} instrumentos finalizados sin informe aprobado.`)
        }
        const singles = matrix.filter((row) => row.convergence === 'SINGLE_SOURCE').length
        if (singles > 0) limits.push(`${singles} áreas apoyadas en una sola fuente.`)
        return limits.length > 0 ? limits : ['Sin limitaciones registradas.']
      })(),
      needsNarrative: false,
    },
    {
      id: 'hipotesis',
      title: 'Hipótesis interpretativas',
      facts: [],
      needsNarrative: true,
    },
    {
      id: 'conclusiones',
      title: 'Conclusiones profesionales',
      facts: battery
        .filter((entry) => entry.conclusion.status === 'APPROVED' && entry.conclusion.text.trim())
        .map((entry) => `${entry.name}: ${entry.conclusion.text.trim()}`),
      needsNarrative: true,
    },
    {
      id: 'recomendaciones',
      title: 'Recomendaciones',
      facts: battery.flatMap((entry) =>
        entry.orientations.filter((item) => item.status === 'ACCEPTED').map((item) => `${entry.name}: ${item.text}`),
      ),
      needsNarrative: true,
    },
  ]

  const gaps: string[] = []
  if (battery.length === 0) gaps.push('La batería no contiene instrumentos.')
  if (summary.completed === 0 && battery.length > 0) gaps.push('Ningún instrumento de la batería está finalizado.')
  if (areas.length === 0) gaps.push('No hay áreas funcionales exploradas con las que cruzar los resultados.')
  if (summary.awaitingReview > 0) gaps.push('Hay instrumentos finalizados cuyo informe no está aprobado.')

  return { sections, matrix, highlights, gaps }
}

/**
 * Extracto autorizado para un modelo. Sólo hechos ya registrados y hallazgos ya
 * derivados: ni identidad del evaluado, ni archivos, ni texto libre ajeno.
 */
export function authorizedSynthesisContext(material: SynthesisMaterial) {
  return {
    sections: material.sections.map((section) => ({ id: section.id, title: section.title, facts: section.facts })),
    evidence: material.matrix
      .filter((row) => row.sources.length > 0)
      .map((row) => ({
        area: row.area,
        direction: evidenceDirectionLabels[row.direction],
        level: evidenceLevelLabels[row.level],
        convergence: convergenceLabels[row.convergence],
        sources: row.sources.map((source) => ({ label: source.label, finding: source.finding })),
      })),
    gaps: material.gaps,
  }
}
