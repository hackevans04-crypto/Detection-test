'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { UploadCloud } from 'lucide-react'
import { StepFooter } from '@/features/evaluations/workspace/step-footer'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { sortedBattery } from '@/lib/instruments/battery'
import { isArchivedInstrument } from '@/instruments/catalog'
import { IntakeSection } from '@/features/evaluations/instruments/center/intake-section'
import { ProcessedInstruments } from '@/features/evaluations/instruments/center/processed-instruments'
import { InstrumentDetail, instrumentRequiresReview } from '@/features/evaluations/instruments/center/instrument-detail'
import { ServiceStatusBanner, type ServiceStatus } from '@/features/evaluations/instruments/center/service-status-banner'
import { buildEvaluationContext } from '@/lib/evaluations/context-service'
import { getInstrumentCapabilities } from '@/features/evaluations/instruments/center/instrument-capabilities'
import { canCloseStep6, getStep6CompletionState } from '@/lib/instruments/step6-completion'
import { resolveNormativeApplicability } from '@/lib/instruments/instrument-registry'

export function InstrumentCenter() {
  const { evaluation, saveState, saveError, saveNow, update } = useEvaluation()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const visibleBattery = useMemo(
    () => sortedBattery(evaluation.battery).filter((entry) => !isArchivedInstrument(entry.instrumentId)),
    [evaluation.battery],
  )
  const archivedBattery = useMemo(
    () => sortedBattery(evaluation.battery).filter((entry) => isArchivedInstrument(entry.instrumentId)),
    [evaluation.battery],
  )
  const mostRecent = useMemo(
    () => [...visibleBattery].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    [visibleBattery],
  )
  const selected = visibleBattery.find((entry) => entry.id === selectedId) ?? mostRecent
  const selectedPackage = selected
    ? evaluation.instrumentPackages.find((pkg) => pkg.id === selected.instrumentId || pkg.blueprintId === selected.blueprintId)
    : undefined
  const degraded = saveState === 'error'
  const context = useMemo(() => buildEvaluationContext(evaluation), [evaluation])
  const capabilities = selected
    ? getInstrumentCapabilities({
        entry: selected,
        pkg: selectedPackage,
        normativelyApplicable: !isInstrumentOutsideNorms(selected, selectedPackage, context.person.chronologicalAge.value),
      })
    : null
  const step6State = useMemo(() => getStep6CompletionState(evaluation), [evaluation])
  const step6CanClose = canCloseStep6(step6State)
  const reviewBlocksNext = selected && capabilities
    ? !capabilities.canContinueWorkflow && instrumentRequiresReview(selected, selectedPackage, context.person.chronologicalAge.value)
    : true

  useEffect(() => {
    const migrations = visibleBattery
      .map((entry) => {
        const pkg = evaluation.instrumentPackages.find((item) => item.id === entry.instrumentId || item.blueprintId === entry.blueprintId)
        if (!pkg) return null
        const resolved = getInstrumentCapabilities({ entry, pkg }).identity
        if (resolved.name === 'Instrumento sin identificar' || resolved.name === entry.name) return null
        return { entryId: entry.id, name: resolved.name, subtitle: entry.subtitle || resolved.subtitle }
      })
      .filter((item): item is { entryId: string; name: string; subtitle: string } => item !== null)

    if (migrations.length === 0) return
    update((current) => ({
      ...current,
      battery: current.battery.map((entry) => {
        const migration = migrations.find((item) => item.entryId === entry.id)
        return migration ? { ...entry, name: migration.name, subtitle: migration.subtitle } : entry
      }),
    }))
  }, [evaluation.instrumentPackages, update, visibleBattery])

  return (
    <InstrumentAICenter serviceStatus={degraded ? 'SERVER_ERROR' : null} onRetry={() => void saveNow()}>
      <div className="dt-instrument-workspace">
        <aside className="dt-instrument-control" aria-label="Control de Instrumentos IA">
          <IntakeSection persistenceAvailable={!degraded} onCommitted={setSelectedId} />
          <ProcessedInstruments
            battery={visibleBattery}
            activeId={selected?.id ?? null}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
          />
          {archivedBattery.length > 0 ? <ArchivedInstruments count={archivedBattery.length} /> : null}
        </aside>
        <main className="dt-instrument-main" aria-label="Contenido activo del instrumento">
          {selected ? <InstrumentDetail entry={selected} battery={visibleBattery} /> : <EmptyInstrumentState />}
        </main>
      </div>
      {saveError ? <p className="dt-ai-error">{saveError}</p> : null}
      <StepFooter
        step="instrumentos"
        disableNext={visibleBattery.length === 0 || (!step6CanClose && reviewBlocksNext)}
        disabledNextReason="Procese el material o documente la limitación antes de continuar."
      />
    </InstrumentAICenter>
  )
}

function isInstrumentOutsideNorms(entry: Parameters<typeof instrumentRequiresReview>[0], pkg: Parameters<typeof instrumentRequiresReview>[1], age?: string | null) {
  const years = /(\d{1,2})/.exec(age ?? '')?.[1]
  const parsed = years ? Number(years) : null
  return resolveNormativeApplicability([entry.name, entry.subtitle, pkg?.name, pkg?.fingerprint.acronym], parsed).status === 'NOT_APPLICABLE'
}

export function InstrumentCenterUnavailable({
  status = 'DATABASE_UNAVAILABLE',
  onRetry,
}: {
  status?: ServiceStatus
  onRetry?: () => void
}) {
  return (
    <InstrumentAICenter serviceStatus={status} onRetry={onRetry}>
      <div className="dt-instrument-workspace">
        <aside className="dt-instrument-control" aria-label="Control de Instrumentos IA">
          <DisabledUploader />
        </aside>
        <main className="dt-instrument-main" aria-label="Contenido activo del instrumento">
          <EmptyInstrumentState />
        </main>
      </div>
    </InstrumentAICenter>
  )
}

function InstrumentAICenter({
  children,
  serviceStatus,
  onRetry,
}: {
  children: ReactNode
  serviceStatus: ServiceStatus | null
  onRetry?: () => void
}) {
  return (
    <section className="dt-ai-instruments" aria-labelledby="instrumentos-ai-title">
      {serviceStatus ? <ServiceStatusBanner status={serviceStatus} onRetry={onRetry} /> : null}
      <header className="dt-ai-step-hero">
        <div>
          <span>Paso 6</span>
          <h2 id="instrumentos-ai-title">Instrumentos IA</h2>
          <p>Digitalice, analice y consolide instrumentos de evaluación vinculados al expediente.</p>
        </div>
      </header>
      {children}
    </section>
  )
}

function DisabledUploader() {
  return (
    <>
      <section className="dt-ai-upload" aria-labelledby="incorporar-instrumento-title">
        <div className="dt-ai-upload-copy">
          <span className="dt-ai-upload-icon" aria-hidden="true">
            <UploadCloud />
          </span>
          <h3 id="incorporar-instrumento-title">Nuevo análisis</h3>
          <p>Cargue el material disponible para su análisis.</p>
          <small>PDF · DOCX · XLS/XLSX · JPG/PNG · ZIP/RAR</small>
        </div>
        <div className="dt-upload-actions">
          <button type="button" className="dt-btn dt-btn-primary" disabled>
            <UploadCloud aria-hidden="true" />
            Seleccionar archivos
          </button>
          <button type="button" className="dt-btn dt-btn-secondary" disabled>
            Seleccionar carpeta
          </button>
        </div>
      </section>
      <section className="dt-ai-section" aria-labelledby="indicacion-ia-title">
        <div className="dt-ai-section-head">
          <div>
            <div>
              <h3 id="indicacion-ia-title">Indicación Detection AI</h3>
              <p>Agregue una indicación sólo si necesita orientar el análisis.</p>
            </div>
          </div>
        </div>
        <textarea
          className="dt-narrative"
          rows={3}
          placeholder="Agregue una indicación opcional para orientar el análisis."
          disabled
        />
        <div className="dt-ai-actions">
          <button type="button" className="dt-btn dt-btn-primary" title="Restablece la conexión para continuar." disabled>
            Analizar instrumento
          </button>
        </div>
      </section>
    </>
  )
}

function EmptyInstrumentState() {
  return (
    <section className="dt-ai-section dt-ai-empty" aria-labelledby="sin-instrumento-activo-title">
      <UploadCloud aria-hidden="true" />
      <h3 id="sin-instrumento-activo-title">Sin instrumento activo</h3>
      <p>Cargue el material disponible para que Detection AI lo analice y lo estructure.</p>
    </section>
  )
}

function ArchivedInstruments({ count }: { count: number }) {
  return (
    <details className="dt-archived-instruments">
      <summary>Instrumentos anteriores ({count})</summary>
      <p>Se conservan en el historial del expediente y no se muestran como instrumentos activos.</p>
    </details>
  )
}
