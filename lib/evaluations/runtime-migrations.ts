import type { Evaluation } from '@/lib/evaluations/model'
import type { InstrumentPackage, PackageFile } from '@/lib/instruments/import/package-model'

function normalizePackage(pkg: InstrumentPackage): InstrumentPackage {
  return {
    ...pkg,
    files: Array.isArray(pkg.files) ? pkg.files : [],
    findings: Array.isArray(pkg.findings) ? pkg.findings : [],
    computedResults: Array.isArray(pkg.computedResults) ? pkg.computedResults : [],
    responseCandidates: Array.isArray(pkg.responseCandidates) ? pkg.responseCandidates : [],
    extractedResponses: Array.isArray(pkg.extractedResponses) ? pkg.extractedResponses : [],
    consistency: Array.isArray(pkg.consistency) ? pkg.consistency : [],
    blocks: Array.isArray(pkg.blocks) ? pkg.blocks : [],
  }
}

function fileText(file: PackageFile) {
  return [
    file.name,
    file.path,
    file.role,
    file.reason,
    ...(Array.isArray(file.evidence) ? file.evidence : []),
  ]
    .join(' ')
    .toLowerCase()
}

function isArchive(file: PackageFile) {
  return /\.(rar|zip)$/i.test(file.name) || /\.(rar|zip)$/i.test(file.path)
}

function isLegacyVisualPackage(pkg: InstrumentPackage) {
  const files = Array.isArray(pkg.files) ? pkg.files : []
  const accepted = files.filter((file) => file.status === 'ACCEPTED')
  const text = [
    pkg.name,
    pkg.errorMessage,
    pkg.readiness,
    ...files.map(fileText),
    ...pkg.blocks.flatMap((block) => [...block.notes, block.label]),
  ]
    .join(' ')
    .toLowerCase()

  const visualFallback =
    text.includes('modo diseño') ||
    text.includes('modo diseno') ||
    text.includes('flujo visual') ||
    text.includes('pendiente de integracion funcional') ||
    text.includes('pendiente de integración funcional') ||
    text.includes('paquete comprimido conservado sin abrir')

  const archiveAcceptedAsSupport =
    accepted.length === 1 &&
    isArchive(accepted[0]) &&
    (accepted[0].role === 'SUPPORT_DOCUMENT' || accepted[0].role === 'SUPPORT')

  return visualFallback || archiveAcceptedAsSupport
}

export function normalizeEvaluationRuntimeState(evaluation: Evaluation): Evaluation {
  const instrumentPackages = (evaluation.instrumentPackages ?? []).map((pkg) => normalizePackage(pkg))
  const legacyPackageIds = new Set(instrumentPackages.filter(isLegacyVisualPackage).map((pkg) => pkg.id))
  if (legacyPackageIds.size === 0) return { ...evaluation, instrumentPackages }

  const battery = evaluation.battery.filter((entry) => !legacyPackageIds.has(entry.instrumentId))
  const removedBatteryIds = new Set(
    evaluation.battery.filter((entry) => legacyPackageIds.has(entry.instrumentId)).map((entry) => entry.id),
  )
  const backups = evaluation.backups.filter(
    (backup) => !backup.evaluationInstrumentId || !removedBatteryIds.has(backup.evaluationInstrumentId),
  )

  return {
    ...evaluation,
    instrumentPackages: instrumentPackages.filter((pkg) => !legacyPackageIds.has(pkg.id)),
    battery,
    backups,
  }
}
