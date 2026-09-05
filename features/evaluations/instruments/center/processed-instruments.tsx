'use client'

import { ChevronDown } from 'lucide-react'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { sessionStatusLabels, type EvaluationInstrument } from '@/lib/evaluations/model'
import { acceptedFiles, packageReadinessLabels } from '@/lib/instruments/import/package-model'
import { sessionTiming } from '@/lib/instruments/session-timing'

export function ProcessedInstruments({
  battery,
  activeId,
  selectedId,
  onSelect,
}: {
  battery: EvaluationInstrument[]
  activeId: string | null
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { evaluation } = useEvaluation()
  const history = battery.filter((entry) => entry.id !== activeId)

  if (history.length === 0) return null

  return (
    <details className="dt-ai-section dt-instrument-history">
      <summary>
        <span id="procesados-title">Historial de instrumentos</span>
        <small>{history.length} {history.length === 1 ? 'anterior' : 'anteriores'}</small>
        <ChevronDown aria-hidden="true" />
      </summary>
      <ol className="dt-processed-list">
        {history.map((entry) => {
          const timing = sessionTiming(entry.events)
          const relatedPackage = evaluation.instrumentPackages.find(
            (pkg) => pkg.id === entry.instrumentId || pkg.blueprintId === entry.blueprintId,
          )
          const fileCount = relatedPackage ? acceptedFiles(relatedPackage).length : 0
          const dateLabel = timing.completedAt ? new Date(timing.completedAt).toLocaleDateString('es-EC') : 'Sin fecha'
          const stillProcessing = relatedPackage && relatedPackage.stage !== 'REVIEW' && relatedPackage.readiness !== 'FAILED'
          const failed = relatedPackage?.readiness === 'FAILED'
          const requiresReview = relatedPackage?.readiness === 'REQUIRES_REVIEW'

          const tone = stillProcessing
            ? 'neutral'
            : failed
              ? 'danger'
              : requiresReview
                ? 'warning'
                : timing.status === 'COMPLETED'
                  ? 'success'
                  : 'neutral'

          const label = stillProcessing
            ? 'Procesando'
            : failed
              ? 'Error'
              : requiresReview
                ? 'Revision necesaria'
                : sessionStatusLabels[timing.status]

          const actionLabel = stillProcessing ? 'Ver estado' : requiresReview ? 'Revisar' : 'Ver'

          return (
            <li key={entry.id} className="dt-processed-row" data-active={entry.id === selectedId || undefined}>
              <div className="dt-battery-identity">
                <strong>{entry.name}</strong>
                <small>
                  {dateLabel} · {relatedPackage ? packageReadinessLabels[relatedPackage.readiness] : 'Instrumento del expediente'} ·{' '}
                  {fileCount} {fileCount === 1 ? 'material' : 'materiales'}
                </small>
              </div>

              <span className="dt-badge" data-tone={tone}>
                {label}
              </span>

              <div className="dt-battery-actions">
                <button type="button" className="dt-btn dt-btn-secondary dt-btn-sm" onClick={() => onSelect(entry.id)}>
                  {entry.id === selectedId ? 'Abierto' : actionLabel}
                </button>
              </div>
            </li>
          )
        })}
      </ol>
    </details>
  )
}
