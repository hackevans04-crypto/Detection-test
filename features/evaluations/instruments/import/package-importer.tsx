'use client'

import { AlertTriangle, Check } from 'lucide-react'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import {
  packageFileRoleLabels,
  packageReadinessLabels,
  packageStageLabels,
  packageStages,
  type InstrumentPackage,
  type PackageFileRole,
} from '@/lib/instruments/import/package-model'
import { assignableRoles } from '@/lib/instruments/import/file-classifier'

/**
 * Desglose técnico de un paquete ya analizado: etapas recorridas, materiales
 * aceptados/rechazados y el rol asignado a cada archivo. `intake-section.tsx`
 * la sube y la procesa; esto es sólo la vista de "Ver detalles" para quien
 * quiera revisar cómo se clasificó el material, y la que reutiliza
 * `instrument-detail.tsx` en el bloque de materiales del instrumento.
 */
export function PackageSummary({ pkg }: { pkg: InstrumentPackage }) {
  const { update } = useEvaluation()
  const accepted = pkg.files.filter((file) => file.status === 'ACCEPTED')
  const rejected = pkg.files.filter((file) => file.status === 'REJECTED')
  const reviewBlocks = pkg.blocks.filter((block) => block.state === 'REVIEW')
  const automated = accepted.filter(
    (file) => file.role === 'AUTOMATED_SPREADSHEET' || file.role === 'SCORING_TEMPLATE' || file.role === 'NORMS',
  )
  const roleCounts = accepted.reduce<Partial<Record<PackageFileRole, number>>>((counts, file) => {
    counts[file.role] = (counts[file.role] ?? 0) + 1
    return counts
  }, {})
  const detectedRoles = Object.entries(roleCounts).filter(([, count]) => count > 0) as Array<[PackageFileRole, number]>
  const stageIndex = packageStages.indexOf(pkg.stage)

  const reassign = (fileId: string, role: PackageFileRole) =>
    update((current) => ({
      ...current,
      instrumentPackages: current.instrumentPackages.map((item) =>
        item.id === pkg.id
          ? {
              ...item,
              files: item.files.map((file) =>
                file.id === fileId
                  ? { ...file, role, confidence: 1, evidence: [...file.evidence, 'Asignado por el profesional'] }
                  : file,
              ),
            }
          : item,
      ),
    }))

  const tone =
    pkg.readiness === 'READY' ? 'success' : pkg.readiness === 'FAILED' ? 'danger' : 'warning'

  return (
    <article className="dt-package">
      <header>
        <div>
          <h4>{pkg.name ?? 'Instrumento sin identificar'}</h4>
          <p>
            {accepted.length} {accepted.length === 1 ? 'material identificado' : 'materiales identificados'}
          </p>
        </div>
        <span className="dt-badge" data-tone={tone}>
          {packageReadinessLabels[pkg.readiness]}
        </span>
      </header>

      <ol className="dt-ai-stages">
        {packageStages.map((stage, index) => (
          <li key={stage} data-state={index < stageIndex ? 'done' : index === stageIndex ? 'active' : 'pending'}>
            <span className="dt-ai-stage-mark" aria-hidden="true" />
            {packageStageLabels[stage]}
          </li>
        ))}
      </ol>

      {pkg.errorMessage ? <p className="dt-ai-error">{pkg.errorMessage}</p> : null}

      <div className="dt-package-stats" aria-label="Estadísticas del paquete">
        <span>
          <strong>{accepted.length}</strong>
          Aceptados
        </span>
        <span>
          <strong>{rejected.length}</strong>
          Rechazados
        </span>
        <span>
          <strong>{reviewBlocks.length}</strong>
          En revisión
        </span>
        <span>
          <strong>{automated.length}</strong>
          Automatizables
        </span>
      </div>

      {detectedRoles.length > 0 ? (
        <div className="dt-package-role-strip" aria-label="Roles detectados">
          {detectedRoles.map(([role, count]) => (
            <span key={role}>
              {packageFileRoleLabels[role]} <strong>{count}</strong>
            </span>
          ))}
        </div>
      ) : null}

      <ul className="dt-package-files">
        {pkg.files.map((file) => (
          <li key={file.id} data-status={file.status}>
            <span className="dt-package-file-mark" aria-hidden="true">
              {file.status === 'ACCEPTED' ? <Check /> : <AlertTriangle />}
            </span>
            <span className="dt-package-file-identity">
              <strong>{packageFileRoleLabels[file.role]}</strong>
              <small title={file.path}>{file.name}</small>
            </span>
            {file.status === 'ACCEPTED' ? (
              <label className="dt-field dt-field-inline">
                <span className="sr-only">Material de {file.name}</span>
                <select value={file.role} onChange={(event) => reassign(file.id, event.target.value as PackageFileRole)}>
                  {assignableRoles.map((role) => (
                    <option key={role} value={role}>
                      {packageFileRoleLabels[role]}
                    </option>
                  ))}
                  <option value="UNKNOWN">{packageFileRoleLabels.UNKNOWN}</option>
                </select>
              </label>
            ) : (
              <span className="dt-package-file-reason">{file.reason}</span>
            )}
          </li>
        ))}
      </ul>
    </article>
  )
}

/** Texto corto del estado de preparación de un paquete. */
export function packageStateText(readiness: InstrumentPackage['readiness']) {
  if (readiness === 'READY') return 'preparado'
  if (readiness === 'PARTIAL_READY') return 'parcial disponible'
  if (readiness === 'INSUFFICIENT_DATA') return 'datos insuficientes'
  if (readiness === 'REQUIRES_REVIEW') return 'requiere revisión'
  if (readiness === 'PARTIALLY_STRUCTURED') return 'parcial'
  if (readiness === 'SUPPORT_MATERIAL_ONLY') return 'respaldo'
  return 'detenido'
}
