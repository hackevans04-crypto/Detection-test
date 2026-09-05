import { buildEvaluationContext } from '@/lib/evaluations/context-service'
import { functionalAreaSchema } from '@/lib/evaluations/functional-areas'
import {
  recommendationGroupIds,
  type Evaluation,
  type RecommendationGroupId,
  type TextEntry,
} from '@/lib/evaluations/model'
import { buildInstrumentResultBundles, type InstrumentResultBundle } from '@/lib/instruments/evaluation-results-aggregator'

export type AIDraft = {
  id: string
  title: string
  text: string
  domain: string
  sourceRefs: string[]
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  confidenceScore: number
  needsReview: boolean
  evidenceVersion: string
  status: 'AI_DRAFT'
}

export type ConclusionEvidenceDebug = {
  bundleStatus: 'READY_SUFFICIENT' | 'READY_INSUFFICIENT'
  rawEvidenceCount: number
  sanitizedEvidenceCount: number
  rejectedEvidenceCount: number
  signals: Record<string, number>
  rejectionReasons: Array<{ field: string; value: string; reason: string }>
}

export type ConclusionEvidenceBundle = {
  evidenceVersion: string
  evaluatedPerson: string
  context: string[]
  evaluatedAreas: string[]
  difficultyAreas: string[]
  adequateAreas: string[]
  instrumentFindings: string[]
  crossInstrumentPatterns: string[]
  limitations: string[]
  suggestedConclusions: AIDraft[]
  insufficientEvidence: string[]
  debug: ConclusionEvidenceDebug
}

export type RecommendationEvidenceBundle = {
  conclusions: string[]
  limitations: string[]
  suggestedRecommendations: Record<RecommendationGroupId, AIDraft[]>
}

export function buildConclusionEvidence(evaluation: Evaluation): ConclusionEvidenceBundle {
  const rejected: ConclusionEvidenceDebug['rejectionReasons'] = []
  const context = buildEvaluationContext(evaluation)
  const bundles = buildInstrumentResultBundles(evaluation).filter((bundle) => bundle.results.length > 0)
  const evaluatedAreas = functionalAreaSchema.reduce<string[]>((areas, schema) => {
    const performance = sanitizeAreaFinding(evaluation.functionalAreas[schema.id]?.performance, `areas.${schema.id}`, rejected)
    if (performance) areas.push(`${schema.label}: ${performance}`)
    return areas
  }, [])
  const difficultyAreas = evaluatedAreas.filter((area) => /dificultad|desarrollo|alterad/i.test(area))
  const adequateAreas = evaluatedAreas.filter((area) => /adecuad|esperado/i.test(area))
  const instrumentFindings = bundles.flatMap((bundle) => summarizeBundle(bundle, rejected))
  const limitations = bundles.flatMap((bundle) => bundle.limitations).reduce<string[]>((items, limitation) => {
    const clean = sanitizeProfessionalFinding(limitation, 'instrument.limitation', rejected)
    if (clean && !items.includes(clean)) items.push(clean)
    return items
  }, [])
  const contextItems = [
    buildContextItem('Motivo', context.evaluation.reason.value, sanitizeEvaluationReason, 'reason', rejected),
    buildContextItem('Edad', context.person.chronologicalAge.value, sanitizeDemographicField, 'age', rejected),
    buildContextItem('Escolaridad', context.academic.currentLevel.value, sanitizeDemographicField, 'academicLevel', rejected),
  ].filter((value): value is string => Boolean(value))
  const evidenceSeed = [
    context.person.fullName.value,
    context.person.chronologicalAge.value,
    context.evaluation.reason.value,
    context.academic.currentLevel.value,
    ...evaluatedAreas,
    ...instrumentFindings,
    ...limitations,
  ]
    .map((value) => sanitizeEvidenceField(value))
    .filter((value): value is string => Boolean(value))
  const evidenceVersion = stableId(evidenceSeed.join('|') || evaluation.updatedAt || evaluation.id)
  const suggestedConclusions = buildConclusionDrafts({
    bundles,
    evaluatedAreas,
    difficultyAreas,
    adequateAreas,
    limitations,
    evidenceVersion,
  })
  const signals = {
    instrumentResults: bundles.reduce((sum, bundle) => sum + bundle.results.length, 0),
    instrumentFindings: instrumentFindings.length,
    evaluatedAreas: evaluatedAreas.length,
    difficultyAreas: difficultyAreas.length,
    adequateAreas: adequateAreas.length,
    relevantContext: contextItems.length,
  }
  const rawEvidenceCount = [
    context.person.fullName.value,
    context.person.chronologicalAge.value,
    context.evaluation.reason.value,
    context.academic.currentLevel.value,
    ...Object.values(evaluation.functionalAreas).map((area) => area.performance),
    ...bundles.flatMap((bundle) => bundle.results.map((result) => String(result.value))),
    ...bundles.flatMap((bundle) => bundle.limitations),
  ].filter((value) => String(value ?? '').trim()).length
  const sanitizedEvidenceCount = Object.values(signals).reduce((sum, count) => sum + count, 0)
  const debug: ConclusionEvidenceDebug = {
    bundleStatus: suggestedConclusions.length > 0 ? 'READY_SUFFICIENT' : 'READY_INSUFFICIENT',
    rawEvidenceCount,
    sanitizedEvidenceCount,
    rejectedEvidenceCount: rejected.length,
    signals,
    rejectionReasons: rejected,
  }

  return {
    evidenceVersion,
    evaluatedPerson: sanitizeDemographicField(context.person.fullName.value, 'person.fullName', rejected) ?? 'Evaluado no registrado',
    context: contextItems,
    evaluatedAreas,
    difficultyAreas,
    adequateAreas,
    instrumentFindings,
    crossInstrumentPatterns:
      bundles.length > 1
        ? ['Los resultados deben integrarse entre instrumentos antes de emitir conclusiones finales.']
        : [],
    limitations,
    suggestedConclusions,
    insufficientEvidence:
      suggestedConclusions.length === 0
        ? ['No se encontraron resultados, areas evaluadas o hallazgos confirmados suficientes para redactar conclusiones asistidas.']
        : [],
    debug,
  }
}

export function buildRecommendationEvidence(evaluation: Evaluation): RecommendationEvidenceBundle {
  const conclusions = acceptedConclusions(evaluation).map((entry) => entry.text.trim()).filter(Boolean)
  const conclusionEvidence = buildConclusionEvidence(evaluation)
  const baseRefs = ['Conclusiones aceptadas', ...conclusionEvidence.instrumentFindings.slice(0, 2)]
  const suggestedRecommendations: Record<RecommendationGroupId, AIDraft[]> = {
    docentes: [],
    'pedagogo-apoyo': [],
    dece: [],
    'representante-legal': [],
    psicopedagogo: [],
  }

  if (conclusions.length > 0) {
    suggestedRecommendations.docentes.push(draft({
      title: 'Apoyos de aula',
      text: 'Ajustar las actividades de aula a las conclusiones aceptadas, priorizando instrucciones claras, apoyos observables y seguimiento del desempeno.',
      domain: 'docentes',
      sourceRefs: baseRefs,
      confidenceScore: 0.78,
      evidenceVersion: conclusionEvidence.evidenceVersion,
    }))
    suggestedRecommendations['pedagogo-apoyo'].push(draft({
      title: 'Plan de acompanamiento',
      text: 'Planificar acompanamiento psicopedagogico con objetivos derivados de las conclusiones aceptadas y revisar avances en periodos definidos.',
      domain: 'pedagogo-apoyo',
      sourceRefs: baseRefs,
      confidenceScore: 0.78,
      evidenceVersion: conclusionEvidence.evidenceVersion,
    }))
    suggestedRecommendations.dece.push(draft({
      title: 'Seguimiento institucional',
      text: 'Mantener seguimiento institucional del caso y coordinar la socializacion de resultados con los actores autorizados.',
      domain: 'dece',
      sourceRefs: baseRefs,
      confidenceScore: 0.72,
      evidenceVersion: conclusionEvidence.evidenceVersion,
    }))
    suggestedRecommendations['representante-legal'].push(draft({
      title: 'Apoyo familiar',
      text: 'Acompanar las rutinas de estudio en casa con organizacion, refuerzo positivo y comunicacion periodica con la institucion.',
      domain: 'representante-legal',
      sourceRefs: baseRefs,
      confidenceScore: 0.7,
      evidenceVersion: conclusionEvidence.evidenceVersion,
    }))
    suggestedRecommendations.psicopedagogo.push(draft({
      title: 'Trazabilidad profesional',
      text: 'Registrar la trazabilidad de la intervencion y contrastar las recomendaciones con la evolucion observada del evaluado.',
      domain: 'psicopedagogo',
      sourceRefs: baseRefs,
      confidenceScore: 0.76,
      evidenceVersion: conclusionEvidence.evidenceVersion,
    }))
  }

  return {
    conclusions,
    limitations: conclusionEvidence.limitations,
    suggestedRecommendations,
  }
}

export function acceptedConclusions(evaluation: Evaluation) {
  return evaluation.conclusions.filter(isAcceptedConclusion)
}

export function isAcceptedConclusion(entry: TextEntry) {
  if (!entry.text.trim()) return false
  if (entry.status === 'AI_DRAFT' || entry.status === 'DISCARDED' || entry.status === 'STALE') return false
  if (entry.source === 'AI' && !entry.status) return false
  return entry.status === 'ACCEPTED' || entry.status === 'EDITED_ACCEPTED' || entry.source === 'MANUAL' || !entry.status
}

export function hasValidConclusionEvidence(entry: TextEntry, currentEvidenceVersion?: string) {
  if (!isAcceptedConclusion(entry)) return false
  if (entry.evidenceVersion && currentEvidenceVersion && entry.evidenceVersion !== currentEvidenceVersion) return false
  return (entry.evidenceRefs?.length ?? 0) > 0 || entry.source === 'MANUAL' || !entry.source
}

export function sanitizeEvidenceField(value: unknown) {
  return sanitizeField(value, 'evidence', [], { rejectGarbageFreeText: false })
}

export function sanitizeDemographicField(
  value: unknown,
  field = 'demographic',
  rejected: ConclusionEvidenceDebug['rejectionReasons'] = [],
) {
  return sanitizeField(value, field, rejected, { rejectGarbageFreeText: true })
}

export function sanitizeEvaluationReason(
  value: unknown,
  field = 'evaluationReason',
  rejected: ConclusionEvidenceDebug['rejectionReasons'] = [],
) {
  return sanitizeField(value, field, rejected, { rejectGarbageFreeText: true })
}

export function sanitizeAreaFinding(
  value: unknown,
  field = 'areaFinding',
  rejected: ConclusionEvidenceDebug['rejectionReasons'] = [],
) {
  return sanitizeField(value, field, rejected, { rejectGarbageFreeText: false })
}

export function sanitizeInstrumentResult(
  value: unknown,
  field = 'instrumentResult',
  rejected: ConclusionEvidenceDebug['rejectionReasons'] = [],
) {
  return sanitizeField(value, field, rejected, { rejectGarbageFreeText: false })
}

export function sanitizeProfessionalFinding(
  value: unknown,
  field = 'professionalFinding',
  rejected: ConclusionEvidenceDebug['rejectionReasons'] = [],
) {
  return sanitizeField(value, field, rejected, { rejectGarbageFreeText: false })
}

function sanitizeField(
  value: unknown,
  field: string,
  rejected: ConclusionEvidenceDebug['rejectionReasons'],
  options: { rejectGarbageFreeText: boolean },
) {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (!trimmed) return null
  const reject = (reason: string) => {
    rejected.push({ field, value: trimmed, reason })
    return null
  }
  if (/^(n\/a|na|no aplica|sin registrar|no registrado|pendiente|undefined|null|-|\.)$/i.test(trimmed)) {
    return reject('placeholder')
  }
  if (/^[a-f0-9-]{16,}$/i.test(trimmed)) return reject('internal-code')
  if (/^\d+\s*[·\-.]\s*[a-z]{2,}$/i.test(trimmed)) return reject('mixed-garbage-code')
  if (options.rejectGarbageFreeText && /^[a-z]{3,}$/i.test(trimmed) && !/[aeiouáéíóúñ]{2,}/i.test(trimmed)) {
    return reject('garbage-free-text')
  }
  return trimmed
}

function buildContextItem(
  label: string,
  value: string | null,
  sanitizer: (value: unknown, field: string, rejected: ConclusionEvidenceDebug['rejectionReasons']) => string | null,
  field: string,
  rejected: ConclusionEvidenceDebug['rejectionReasons'],
) {
  const clean = sanitizer(value, field, rejected)
  return clean ? `${label}: ${clean}` : ''
}

function summarizeBundle(bundle: InstrumentResultBundle, rejected: ConclusionEvidenceDebug['rejectionReasons']) {
  const resultText = bundle.results
    .slice(0, 4)
    .map((result) => {
      const value = sanitizeInstrumentResult(String(result.value), `instrument.${bundle.instrumentIdentity}.${result.label}`, rejected)
      return value ? `${result.label}: ${value}` : ''
    })
    .filter(Boolean)
    .join('; ')
  const findings = bundle.interpretation.findings
    .slice(0, 2)
    .map((finding) => sanitizeProfessionalFinding(finding, `instrument.${bundle.instrumentIdentity}.finding`, rejected))
    .filter((finding): finding is string => Boolean(finding))
  return [
    resultText ? `${bundle.instrumentIdentity}: ${resultText}` : '',
    ...findings.map((finding) => `${bundle.instrumentIdentity}: ${finding}`),
  ].filter(Boolean)
}

function buildConclusionDrafts(input: {
  bundles: InstrumentResultBundle[]
  evaluatedAreas: string[]
  difficultyAreas: string[]
  adequateAreas: string[]
  limitations: string[]
  evidenceVersion: string
}) {
  const drafts: AIDraft[] = []

  for (const bundle of input.bundles) {
    const resultText = bundle.results
      .slice(0, 3)
      .map((result) => {
        const value = sanitizeInstrumentResult(String(result.value))
        return value ? `${result.label} ${value}` : ''
      })
      .filter(Boolean)
      .join(', ')
    if (!resultText) continue
    const limitationText = bundle.limitations.length
      ? ' La lectura se mantiene como descriptiva por las limitaciones registradas.'
      : ''
    drafts.push(draft({
      title: `${bundle.instrumentIdentity}: sintesis instrumental`,
      text: `En ${bundle.instrumentIdentity} se registran resultados verificables (${resultText}).${limitationText}`,
      domain: bundle.instrumentIdentity,
      sourceRefs: [bundle.instrumentIdentity, ...bundle.evidence.slice(0, 3)],
      confidenceScore: bundle.limitations.length ? 0.72 : 0.84,
      needsReview: bundle.limitations.length > 0,
      evidenceVersion: input.evidenceVersion,
    }))
  }

  if (input.evaluatedAreas.length > 0 && input.bundles.length > 0) {
    drafts.push(draft({
      title: 'Integracion funcional del perfil',
      text: `Las areas evaluadas registradas (${input.evaluatedAreas.slice(0, 4).join(', ')}) se articulan con los resultados instrumentales disponibles en un perfil funcional inicial.`,
      domain: 'integracion',
      sourceRefs: ['Areas evaluadas', ...input.bundles.map((bundle) => bundle.instrumentIdentity).slice(0, 3)],
      confidenceScore: input.limitations.length ? 0.68 : 0.76,
      needsReview: input.limitations.length > 0,
      evidenceVersion: input.evidenceVersion,
    }))
  }

  if (input.evaluatedAreas.length > 0) {
    const focus = input.difficultyAreas.length > 0 ? input.difficultyAreas : input.evaluatedAreas
    const strengthText =
      input.adequateAreas.length > 0
        ? ` Tambien se registran areas conservadas (${input.adequateAreas.slice(0, 2).join(', ')}) que pueden considerarse fortalezas relativas.`
        : ''
    drafts.push(draft({
      title: input.difficultyAreas.length > 0 ? 'Sintesis de areas con necesidad de apoyo' : 'Sintesis de areas evaluadas',
      text: `Las areas funcionales registradas permiten una sintesis profesional inicial: ${focus.slice(0, 5).join(', ')}.${strengthText}`,
      domain: 'areas-funcionales',
      sourceRefs: ['Areas evaluadas', ...focus.slice(0, 4)],
      confidenceScore: input.bundles.length > 0 ? 0.76 : 0.66,
      needsReview: input.bundles.length === 0,
      evidenceVersion: input.evidenceVersion,
    }))
  }

  return dedupeDrafts(drafts)
}

function draft(input: {
  title: string
  text: string
  domain: string
  sourceRefs: string[]
  confidenceScore: number
  needsReview?: boolean
  evidenceVersion: string
}): AIDraft {
  const sourceRefs = input.sourceRefs.reduce<string[]>((refs, source) => {
    const clean = sanitizeEvidenceField(source)
    if (clean && !refs.includes(clean)) refs.push(clean)
    return refs
  }, [])
  return {
    id: stableId(`${input.evidenceVersion}:${input.title}:${input.text}`),
    title: input.title,
    text: input.text,
    domain: input.domain,
    sourceRefs,
    confidence: input.confidenceScore >= 0.8 ? 'HIGH' : input.confidenceScore >= 0.65 ? 'MEDIUM' : 'LOW',
    confidenceScore: input.confidenceScore,
    needsReview: input.needsReview ?? input.confidenceScore < 0.7,
    evidenceVersion: input.evidenceVersion,
    status: 'AI_DRAFT',
  }
}

function dedupeDrafts(drafts: AIDraft[]) {
  const seen = new Set<string>()
  return drafts.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function stableId(text: string) {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }
  return `draft-${hash.toString(36)}`
}
