import { resolveInstrumentIdentity } from '@/lib/instruments/import/identity-resolver'
import { acceptedFiles, type InstrumentPackage } from '@/lib/instruments/import/package-model'
import type { EvaluationInstrument } from '@/lib/evaluations/model'

export type InstrumentCapabilities = {
  identity: {
    name: string
    subtitle: string
    acronym: string | null
  }
  hasScores: boolean
  hasImportedResults: boolean
  hasResponses: boolean
  hasPendingReview: boolean
  canBuildBlueprint: boolean
  canExtractResponses: boolean
  canScoreRaw: boolean
  canScoreNormative: boolean
  canViewResults: boolean
  canGenerateCharts: boolean
  canViewDescriptiveResults: boolean
  canViewNormativeResults: boolean
  canGenerateInterpretation: boolean
  canGenerateInterpretationDraft: boolean
  canGeneratePartialReport: boolean
  canGenerateFinalReport: boolean
  canExportToStep7: boolean
  canContinueWorkflow: boolean
}

export function getInstrumentCapabilities(input: {
  entry: EvaluationInstrument
  pkg?: InstrumentPackage
  normativelyApplicable?: boolean
}): InstrumentCapabilities {
  const { entry, pkg } = input
  const identity = resolveInstrumentIdentity([
    pkg?.name,
    pkg?.fingerprint.acronym,
    pkg?.instrumentIdentity.acronym,
    pkg?.instrumentIdentity.normalizedName,
    pkg?.originalArchive?.name,
    ...(pkg?.files.map((file) => file.name) ?? []),
    entry.name,
    entry.subtitle,
  ])
  const hasScores = Object.values(entry.scores).some((score) => score.value.trim())
  const hasImportedResults = Boolean(pkg?.computedResults?.some((result) => hasComputedValue(result)))
  const hasNormativeResult = Boolean(pkg?.computedResults?.some((result) => result.transformedValue || result.percentile !== null || result.classification))
  const hasExtractedResponses = Boolean(pkg?.extractedResponses?.some((set) => set.responses.some((response) => response.status === 'EXTRACTED')))
  const hasCompletedResponseCandidate = Boolean(pkg?.responseCandidates?.some((candidate) => candidate.status === 'COMPLETED_RESPONSE'))
  const hasResponses = Boolean(pkg?.diagnostics)
    ? Boolean(pkg?.diagnostics?.capabilities.hasApplication || hasExtractedResponses || hasCompletedResponseCandidate)
    : hasExtractedResponses || hasCompletedResponseCandidate
  const hasPendingReview = Boolean(pkg?.blocks.some((block) => block.state !== 'OK'))
  const hasAnyResults = hasScores || hasImportedResults
  const normativelyApplicable = input.normativelyApplicable !== false
  const partialReady = pkg?.readiness === 'PARTIAL_READY' || hasAnyResults
  const canBuildBlueprint = Boolean(pkg && pkg.readiness !== 'FAILED')
  const canScoreRaw = hasExtractedResponses || hasScores || hasImportedResults
  const canExportToStep7 = pkg?.diagnostics?.capabilities.canExportToStep7 ?? hasAnyResults

  return {
    identity: {
      name: identity.name,
      subtitle: identity.subtitle,
      acronym: identity.acronym,
    },
    hasScores,
    hasImportedResults,
    hasResponses,
    hasPendingReview,
    canBuildBlueprint,
    canExtractResponses: hasCompletedResponseCandidate,
    canScoreRaw,
    canScoreNormative: (hasNormativeResult || hasScores) && normativelyApplicable,
    canViewResults: hasAnyResults,
    canGenerateCharts: hasAnyResults,
    canViewDescriptiveResults: hasAnyResults,
    canViewNormativeResults: (hasNormativeResult || hasScores) && normativelyApplicable,
    canGenerateInterpretation: hasAnyResults,
    canGenerateInterpretationDraft: hasAnyResults,
    canGeneratePartialReport: hasAnyResults,
    canGenerateFinalReport: hasAnyResults && normativelyApplicable && !hasPendingReview && entry.report.status === 'APPROVED',
    canExportToStep7,
    canContinueWorkflow: Boolean(pkg && (pkg.readiness === 'READY' || partialReady)),
  }
}

function hasComputedValue(result: NonNullable<InstrumentPackage['computedResults']>[number]) {
  return Boolean(result.rawValue || result.transformedValue || result.percentile !== null || result.classification)
}
