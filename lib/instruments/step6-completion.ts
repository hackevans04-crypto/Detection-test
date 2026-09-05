import { getInstrument } from '@/instruments/catalog'
import type { Evaluation, InstrumentApplication } from '@/lib/evaluations/model'
import { buildInstrumentResultBundles, type InstrumentResultBundle } from '@/lib/instruments/evaluation-results-aggregator'

export type Step6CompletionStatus =
  | 'NOT_STARTED'
  | 'PROCESSING'
  | 'NEEDS_APPLICATION'
  | 'PARTIAL_RESULTS'
  | 'READY_FOR_STEP7'
  | 'COMPLETED_WITH_LIMITATIONS'
  | 'ERROR'

export type Step6CompletionState = {
  status: Step6CompletionStatus
  bundles: InstrumentResultBundle[]
  limitations: string[]
  diagnostics: {
    instruments: number
    packages: number
    acceptedFiles: number
    resultBundles: number
    computedResults: number
    extractedResponses: number
    completedApplications: number
  }
}

function filled(value: string | undefined | null) {
  return (value ?? '').trim().length > 0
}

function isApplicationComplete(application: InstrumentApplication) {
  const instrument = getInstrument(application.instrumentId)
  if (!instrument || instrument.subtests.length === 0) return false
  return instrument.subtests.every((subtest) => filled(application.entries[subtest.id]?.pd))
}

export function getStep6CompletionState(evaluation: Evaluation): Step6CompletionState {
  const bundles = buildInstrumentResultBundles(evaluation)
  const resultBundles = bundles.filter((bundle) => bundle.results.length > 0)
  const packages = evaluation.instrumentPackages ?? []
  const acceptedFiles = packages.flatMap((pkg) => pkg.files.filter((file) => file.status === 'ACCEPTED'))
  const computedResults = packages.flatMap((pkg) => pkg.computedResults ?? [])
  const extractedResponses = packages.flatMap((pkg) => pkg.extractedResponses ?? [])
  const completedResponseCandidates = packages.flatMap((pkg) =>
    (pkg.responseCandidates ?? []).filter((candidate) => candidate.status === 'COMPLETED_RESPONSE'),
  )
  const completedLegacyApplications = Object.values(evaluation.instrumentApplications ?? {}).filter(isApplicationComplete)
  const completedApplications = completedResponseCandidates.length + completedLegacyApplications.length
  const limitations = [...new Set(bundles.flatMap((bundle) => bundle.limitations))]

  const diagnostics = {
    instruments: evaluation.battery.length,
    packages: packages.length,
    acceptedFiles: acceptedFiles.length,
    resultBundles: resultBundles.length,
    computedResults: computedResults.length,
    extractedResponses: extractedResponses.reduce((sum, set) => sum + set.responses.length, 0),
    completedApplications,
  }

  if (evaluation.battery.length === 0 && packages.length === 0 && Object.keys(evaluation.instrumentApplications ?? {}).length === 0) {
    return { status: 'NOT_STARTED', bundles: resultBundles, limitations, diagnostics }
  }

  if (packages.some((pkg) => pkg.stage !== 'REVIEW' && pkg.readiness !== 'FAILED')) {
    return { status: 'PROCESSING', bundles: resultBundles, limitations, diagnostics }
  }

  if (resultBundles.length > 0) {
    const status = packages.some((pkg) => pkg.readiness !== 'READY') ? 'PARTIAL_RESULTS' : 'READY_FOR_STEP7'
    return { status, bundles: resultBundles, limitations, diagnostics }
  }

  if (completedLegacyApplications.length > 0) {
    return { status: 'READY_FOR_STEP7', bundles: resultBundles, limitations, diagnostics }
  }

  if (packages.some((pkg) => pkg.readiness === 'FAILED')) {
    return { status: 'ERROR', bundles: resultBundles, limitations, diagnostics }
  }

  if (acceptedFiles.length > 0) {
    return {
      status: 'COMPLETED_WITH_LIMITATIONS',
      bundles: resultBundles,
      limitations: [
        ...limitations,
        'Instrumento digitalizado correctamente. No se encontró una aplicación completada del evaluado.',
      ],
      diagnostics,
    }
  }

  return { status: 'NEEDS_APPLICATION', bundles: resultBundles, limitations, diagnostics }
}

export function canCloseStep6(state: Step6CompletionState) {
  return (
    state.status === 'READY_FOR_STEP7' ||
    state.status === 'PARTIAL_RESULTS' ||
    state.status === 'COMPLETED_WITH_LIMITATIONS'
  )
}
