'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileInput,
  FileText,
  Info,
  Layers3,
  ShieldAlert,
  X,
} from 'lucide-react'
import { InstrumentResultDashboard } from '@/features/evaluations/instruments/center/instrument-result-dashboard'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { buildEvaluationContext } from '@/lib/evaluations/context-service'
import { formatDate } from '@/lib/evaluations/format'
import type { EvaluationInstrument } from '@/lib/evaluations/model'
import {
  acceptedFiles,
  packageFileRoleLabels,
  type InstrumentPackage,
  type PackageFile,
  type PackageFileRole,
  type ReviewBlock,
} from '@/lib/instruments/import/package-model'
import { formatConfidence } from '@/lib/instruments/import/confidence'
import { getInstrumentCapabilities, type InstrumentCapabilities } from '@/features/evaluations/instruments/center/instrument-capabilities'
import { resolveNormativeApplicability } from '@/lib/instruments/instrument-registry'

type ApplicabilityStatus = 'APPLICABLE' | 'CONDITIONAL' | 'NOT_APPLICABLE'
type DetectionChipState = 'present' | 'review' | 'missing'
type InstrumentTab = 'summary' | 'material' | 'applicability' | 'results' | 'report'

type ApplicabilityState = {
  status: ApplicabilityStatus
  title: string
  evaluatedAge: string
  detectedRange: string
  foundation: string
}

type PrimaryInstrumentAction = {
  kind:
    | 'REVIEW_APPLICABILITY'
    | 'REVIEW_STRUCTURE'
    | 'REVIEW_NORMS'
    | 'IMPORT_RESPONSES'
    | 'VIEW_RESULTS'
    | 'GENERATE_REPORT'
    | 'FINALIZED'
  title: string
  description: string
  primaryLabel: string
}

export function InstrumentDetail({
  entry,
  battery,
}: {
  entry: EvaluationInstrument
  battery: EvaluationInstrument[]
}) {
  const { evaluation } = useEvaluation()
  const context = useMemo(() => buildEvaluationContext(evaluation), [evaluation])
  const relatedPackage = evaluation.instrumentPackages.find(
    (pkg) => pkg.id === entry.instrumentId || pkg.blueprintId === entry.blueprintId,
  )
  const applicability = relatedPackage ? applicabilityState(relatedPackage, entry, context.person.chronologicalAge.value) : null
  const capabilities = getInstrumentCapabilities({
    entry,
    pkg: relatedPackage,
    normativelyApplicable: applicability?.status !== 'NOT_APPLICABLE',
  })
  const identityName = capabilities.identity.name
  const identitySubtitle = capabilities.identity.subtitle
  const displayEntry =
    entry.name === identityName ? entry : { ...entry, name: identityName, subtitle: entry.subtitle || identitySubtitle }
  const hasValidResults = capabilities.canViewResults
  const hasReportDraft = capabilities.canGeneratePartialReport || entry.report.status !== 'NOT_READY'
  const primaryAction = getPrimaryInstrumentAction({
    entry: displayEntry,
    pkg: relatedPackage,
    hasResponses: capabilities.hasResponses,
    hasValidResults,
    applicability,
  })
  const issues = relatedPackage ? reviewIssues(relatedPackage.blocks, capabilities.hasResponses, applicability) : []
  const [tab, setTab] = useState<InstrumentTab>('summary')
  const [dataOpen, setDataOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const visibleTab = tab === 'results' && !hasValidResults ? 'summary' : tab === 'report' && !hasReportDraft ? 'summary' : tab

  const goToAction = () => {
    if (primaryAction.kind === 'VIEW_RESULTS') setTab('results')
    else if (primaryAction.kind === 'GENERATE_REPORT' || primaryAction.kind === 'FINALIZED') setTab('report')
    else if (primaryAction.kind === 'REVIEW_APPLICABILITY') setTab('applicability')
    else if (primaryAction.kind === 'IMPORT_RESPONSES') setTab('material')
    else setReviewOpen(true)
  }

  return (
    <div className="dt-active-workspace">
      <InstrumentWorkspaceHeader
        entry={displayEntry}
        pkg={relatedPackage}
        capabilities={capabilities}
        onOpenData={() => setDataOpen(true)}
      />
      <InstrumentTabs
        active={visibleTab}
        onChange={setTab}
        hasValidResults={hasValidResults}
        hasReportDraft={hasReportDraft}
      />

      {visibleTab === 'summary' ? (
        <div className="dt-instrument-tab-panel" role="tabpanel" aria-label="Resumen del instrumento">
          <DetectionSummary pkg={relatedPackage} />
          <ApplicabilityCard state={applicability} compact />
          <NextActionCard action={primaryAction} onAction={goToAction} />
        </div>
      ) : null}

      {visibleTab === 'material' ? <MaterialTab pkg={relatedPackage} /> : null}

      {visibleTab === 'applicability' ? (
        <div className="dt-instrument-tab-panel" role="tabpanel" aria-label="Aplicabilidad">
          <ApplicabilityCard state={applicability} />
          <NextActionCard
            action={primaryAction.kind === 'REVIEW_APPLICABILITY' ? primaryAction : reviewApplicabilityAction()}
            onAction={() => setReviewOpen(true)}
          />
        </div>
      ) : null}

      {visibleTab === 'results' && hasValidResults ? (
        <InstrumentResultDashboard
          entry={displayEntry}
          battery={battery}
          pkg={relatedPackage}
          blueprints={evaluation.instrumentBlueprints}
        />
      ) : null}

      {visibleTab === 'report' && hasReportDraft ? (
        <div className="dt-instrument-tab-panel" role="tabpanel" aria-label="Informe">
          <InstrumentResultDashboard
            entry={displayEntry}
            battery={battery}
            pkg={relatedPackage}
            blueprints={evaluation.instrumentBlueprints}
          />
        </div>
      ) : null}

      {dataOpen ? <LinkedEvaluationDataDrawer entry={displayEntry} onClose={() => setDataOpen(false)} /> : null}
      {reviewOpen ? <ReviewDialog issues={issues} onClose={() => setReviewOpen(false)} /> : null}
    </div>
  )
}

function InstrumentWorkspaceHeader({
  entry,
  pkg,
  capabilities,
  onOpenData,
}: {
  entry: EvaluationInstrument
  pkg?: InstrumentPackage
  capabilities: InstrumentCapabilities
  onOpenData: () => void
}) {
  const files = pkg ? acceptedFiles(pkg) : []
  const internalCount = pkg?.originalArchive
    ? Math.max(pkg.files.filter((file) => file.extractedFrom !== null).length, files.length)
    : files.length
  const stateLabel = stateCopy(pkg)
  const subtitle = entry.subtitle || capabilities.identity.subtitle

  return (
    <section className="dt-ai-section dt-active-instrument-card" aria-labelledby="instrumento-activo-title">
      <div className="dt-active-instrument-head">
        <div>
          <h2 id="instrumento-activo-title">{entry.name}</h2>
          <p>{subtitle}.</p>
          <small className="dt-active-instrument-meta">
            {pkg?.originalArchive
              ? `${internalCount} ${internalCount === 1 ? 'archivo interno procesado' : 'archivos internos procesados'}`
              : `${files.length} ${files.length === 1 ? 'material analizado' : 'materiales analizados'}`}{' '}
            · {stateLabel}
          </small>
        </div>
        <div className="dt-active-instrument-actions">
          <span className="dt-badge" data-tone={stateLabel === 'Analizado' ? 'success' : 'warning'}>
            {stateLabel}
          </span>
          <button type="button" className="dt-btn dt-btn-secondary dt-btn-sm" onClick={onOpenData}>
            <Info aria-hidden="true" />
            Ver datos utilizados
          </button>
        </div>
      </div>
    </section>
  )
}

function InstrumentTabs({
  active,
  onChange,
  hasValidResults,
  hasReportDraft,
}: {
  active: InstrumentTab
  onChange: (tab: InstrumentTab) => void
  hasValidResults: boolean
  hasReportDraft: boolean
}) {
  const tabs: Array<{ id: InstrumentTab; label: string; icon: typeof Layers3; disabled?: boolean; title?: string }> = [
    { id: 'summary', label: 'Resumen', icon: Layers3 },
    { id: 'material', label: 'Material', icon: FileText },
    { id: 'applicability', label: 'Aplicabilidad', icon: ShieldAlert },
    {
      id: 'results',
      label: 'Resultados',
      icon: BarChart3,
      disabled: !hasValidResults,
      title: hasValidResults ? undefined : 'Disponible cuando existan resultados válidos.',
    },
    {
      id: 'report',
      label: 'Informe',
      icon: ClipboardCheck,
      disabled: !hasReportDraft,
      title: hasReportDraft ? undefined : 'Disponible cuando el informe tenga resultados válidos.',
    },
  ]

  return (
    <div className="dt-instrument-tabs" role="tablist" aria-label="Secciones del instrumento activo">
      {tabs.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={!item.disabled && active === item.id}
          aria-disabled={item.disabled || undefined}
          data-active={!item.disabled && active === item.id ? true : undefined}
          disabled={item.disabled}
          title={item.title}
          onClick={() => {
            if (!item.disabled) onChange(item.id)
          }}
        >
          <item.icon aria-hidden="true" />
          {item.label}
        </button>
      ))}
    </div>
  )
}

function DetectionSummary({ pkg }: { pkg?: InstrumentPackage }) {
  const chips = materialChips(pkg)
  const confidences = extractionConfidence(pkg)

  return (
    <section className="dt-ai-section dt-ai-compact-section" aria-labelledby="detectado-title">
      <div className="dt-ai-section-head">
        <div>
          <div>
            <h3 id="detectado-title">Qué detectó Detection AI</h3>
            <p>Material clasificado automáticamente. No se inventan respuestas ni puntuaciones.</p>
          </div>
        </div>
      </div>
      {chips.length > 0 ? (
        <ul className="dt-detection-chips">
          {chips.map((chip) => (
            <li key={chip.role} data-state={chip.state}>
              {chip.state === 'present' ? <CheckCircle2 aria-hidden="true" /> : <span aria-hidden="true">○</span>}
              {chip.label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="dt-ai-note">Aún no hay materiales clasificados para este instrumento.</p>
      )}
      {confidences.length > 0 ? (
        <div
          className="dt-extraction-confidence"
          aria-labelledby="confianza-extraccion-title"
          title="Confianza de interpretación digital. No corresponde a validez clínica."
        >
          <strong id="confianza-extraccion-title">Confianza de extracción</strong>
          <dl>
            {confidences.map((item) => (
              <div key={item.label}>
                <dt>
                  {item.label} <span>{item.value}%</span>
                </dt>
                <dd>
                  <i style={{ inlineSize: `${item.value}%` }} aria-hidden="true" />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </section>
  )
}

function MaterialTab({ pkg }: { pkg?: InstrumentPackage }) {
  const [selectedFile, setSelectedFile] = useState<PackageFile | null>(null)
  const files = pkg ? acceptedFiles(pkg) : []
  const roles: PackageFileRole[] = ['MANUAL', 'QUESTION_BOOKLET', 'STIMULUS_BOOK', 'SUPPORT_DOCUMENT', 'NORMS', 'ANSWER_SHEET']

  return (
    <section className="dt-ai-section dt-material-tab" role="tabpanel" aria-labelledby="material-title">
      <div className="dt-ai-section-head">
        <div>
          <div>
            <h3 id="material-title">Material del instrumento</h3>
            <p>Archivos clasificados por Detection AI para revisión profesional.</p>
          </div>
        </div>
      </div>
      <ol className="dt-material-list">
        {roles.map((role) => {
          const file = files.find((item) => item.role === role)
          const status = file ? (file.status === 'ACCEPTED' ? 'Detectado' : 'Revisar') : 'No encontrado'
          const origin = file?.extractedFrom ?? file?.path ?? 'No registrado'
          return (
            <li key={role} data-state={file ? 'present' : 'missing'}>
              <div>
                <strong>{packageFileRoleLabels[role]}</strong>
                <small>{file?.name ?? 'Pendiente de carga'}</small>
              </div>
              <span>{file?.extension ? file.extension.replace('.', '').toUpperCase() : '-'}</span>
              <span>{status}</span>
              <span>{origin}</span>
              <button
                type="button"
                className="dt-btn dt-btn-secondary dt-btn-sm"
                disabled={!file}
                onClick={() => (file ? setSelectedFile(file) : undefined)}
              >
                Ver
              </button>
            </li>
          )
        })}
      </ol>
      {selectedFile ? <MaterialFileDrawer file={selectedFile} onClose={() => setSelectedFile(null)} /> : null}
    </section>
  )
}

function MaterialFileDrawer({ file, onClose }: { file: PackageFile; onClose: () => void }) {
  const roleLabel = packageFileRoleLabels[file.role]
  const confidence = formatConfidence(file.confidence)
  const origin = file.extractedFrom ?? file.path ?? 'No registrado'

  return (
    <>
      <button type="button" className="dt-modal-backdrop" aria-label="Cerrar detalle del material" onClick={onClose} />
      <aside className="dt-side-drawer" role="dialog" aria-modal="true" aria-labelledby="detalle-material-title">
        <header>
          <div>
            <span>{roleLabel}</span>
            <h3 id="detalle-material-title">Detalle del material</h3>
          </div>
          <button type="button" className="dt-icon-button" onClick={onClose} aria-label="Cerrar detalle del material">
            <X aria-hidden="true" />
          </button>
        </header>
        <dl className="dt-ai-context-list">
          <div>
            <dt>Archivo</dt>
            <dd>
              <strong>{file.name}</strong>
            </dd>
          </div>
          <div>
            <dt>Tipo</dt>
            <dd>
              <strong>{file.extension ? file.extension.replace('.', '').toUpperCase() : 'No registrado'}</strong>
            </dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>
              <strong>{file.status === 'ACCEPTED' ? 'Detectado' : 'Requiere revisión'}</strong>
            </dd>
          </div>
          <div>
            <dt>Origen</dt>
            <dd>
              <strong>{origin}</strong>
            </dd>
          </div>
          <div>
            <dt>Confianza</dt>
            <dd>
              <strong>{confidence}</strong>
            </dd>
          </div>
        </dl>
        {file.evidence.length > 0 ? (
          <div className="dt-review-details">
            <h4>Evidencia extraída</h4>
            <ul>
              {file.evidence.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>
    </>
  )
}

export function LinkedEvaluationData({ entry }: { entry?: EvaluationInstrument }) {
  const rows = useLinkedRows(entry)
  return (
    <section className="dt-ai-section dt-linked-data-card" aria-labelledby="datos-vinculados-title">
      <div className="dt-ai-section-head">
        <div>
          <div>
            <h3 id="datos-vinculados-title">Datos vinculados al expediente</h3>
            <p>Datos usados para aplicabilidad, pertinencia e informe.</p>
          </div>
        </div>
      </div>
      <dl className="dt-ai-context-list">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              <strong>{row.value}</strong>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function LinkedEvaluationDataDrawer({ entry, onClose }: { entry: EvaluationInstrument; onClose: () => void }) {
  const rows = useLinkedRows(entry, true)

  return (
    <>
      <button type="button" className="dt-modal-backdrop" aria-label="Cerrar datos utilizados" onClick={onClose} />
      <aside className="dt-side-drawer" role="dialog" aria-modal="true" aria-labelledby="datos-utilizados-title">
        <header>
          <div>
            <span>Expediente</span>
            <h3 id="datos-utilizados-title">Datos utilizados</h3>
          </div>
          <button type="button" className="dt-icon-button" onClick={onClose} aria-label="Cerrar datos utilizados">
            <X aria-hidden="true" />
          </button>
        </header>
        <dl>
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </>
  )
}

function useLinkedRows(entry?: EvaluationInstrument, includeContext = false) {
  const { evaluation } = useEvaluation()
  const context = useMemo(() => buildEvaluationContext(evaluation), [evaluation])
  const professional = normalizeProfessional(
    entry?.professionalName,
    context.evaluation.professional.value,
    evaluation.evaluatorName,
  )
  const mainRows = [
    { label: 'Evaluado', value: context.person.fullName.value ?? 'No registrado' },
    { label: 'Edad', value: context.person.chronologicalAge.value ?? 'No registrado' },
    { label: 'Sexo', value: context.person.sex.value ?? 'No registrado' },
    { label: 'Escolaridad', value: context.academic.currentLevel.value ?? 'No registrado' },
    { label: 'Fecha', value: context.evaluation.date.value ? formatDate(context.evaluation.date.value) : 'No registrado' },
    { label: 'Profesional', value: professional },
  ]
  if (!includeContext) return mainRows
  return [
    ...mainRows,
    { label: 'Motivo', value: context.evaluation.reason.value ?? 'No registrado' },
    {
      label: 'Contexto',
      value: context.context.availableSections.value?.length
        ? `${context.context.availableSections.value.length} secciones registradas`
        : 'No registrado',
    },
    {
      label: 'Áreas',
      value: context.context.completedAreas.value?.length
        ? context.context.completedAreas.value.join(', ')
        : 'No registrado',
    },
  ]
}

export function ReviewRequiredCard({ issues, onOpen }: { issues: string[]; onOpen: () => void }) {
  if (issues.length === 0) return null

  return (
    <section className="dt-review-summary" aria-labelledby="revision-necesaria-title">
      <div>
        <strong id="revision-necesaria-title">Revisión necesaria</strong>
        <span>
          {issues.length} {issues.length === 1 ? 'elemento pendiente' : 'elementos pendientes'}
        </span>
      </div>
      <button type="button" className="dt-btn dt-btn-secondary dt-btn-sm" onClick={onOpen}>
        Ver detalles
      </button>
    </section>
  )
}

function ReviewDialog({ issues, onClose }: { issues: string[]; onClose: () => void }) {
  return (
    <>
      <button type="button" className="dt-modal-backdrop" aria-label="Cerrar revisión" onClick={onClose} />
      <section className="dt-review-dialog" role="dialog" aria-modal="true" aria-labelledby="revision-detalle-title">
        <header>
          <div>
            <span>Validación profesional</span>
            <h3 id="revision-detalle-title">Revisión requerida</h3>
          </div>
          <button type="button" className="dt-icon-button" onClick={onClose} aria-label="Cerrar revisión">
            <X aria-hidden="true" />
          </button>
        </header>
        <ul>
          {(issues.length ? issues : ['No hay elementos pendientes.']).map((issue) => (
            <li key={issue}>
              <AlertTriangle aria-hidden="true" />
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function ApplicabilityCard({ state, compact = false }: { state: ApplicabilityState | null; compact?: boolean }) {
  if (!state) return null
  const tone = state.status === 'APPLICABLE' ? 'success' : 'warning'

  return (
    <section
      className="dt-ai-section dt-applicability-card"
      data-tone={tone}
      data-compact={compact || undefined}
      aria-labelledby="aplicabilidad-title"
    >
      <div className="dt-ai-section-head">
        <div>
          {state.status === 'NOT_APPLICABLE' ? <ShieldAlert aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
          <div>
            <h3 id="aplicabilidad-title">Aplicabilidad</h3>
            <p>{state.title}</p>
          </div>
        </div>
      </div>
      <dl className="dt-applicability-facts">
        <div>
          <dt>Edad</dt>
          <dd>{state.evaluatedAge}</dd>
        </div>
        <div>
          <dt>Rango</dt>
          <dd>{state.detectedRange}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>{state.title}</dd>
        </div>
      </dl>
      <details className="dt-applicability-foundation">
        <summary>Ver fundamento</summary>
        <p>{state.foundation}</p>
      </details>
    </section>
  )
}

function NextActionCard({ action, onAction }: { action: PrimaryInstrumentAction; onAction: () => void }) {
  return (
    <section className="dt-next-action-card" aria-labelledby="proxima-accion-title">
      <div>
        <span>Próxima acción</span>
        <h3 id="proxima-accion-title">{action.title}</h3>
        <p>{action.description}</p>
      </div>
      <div className="dt-next-action-buttons">
        <button type="button" className="dt-btn dt-btn-primary" onClick={onAction}>
          {action.kind === 'IMPORT_RESPONSES' ? <FileInput aria-hidden="true" /> : <ClipboardList aria-hidden="true" />}
          {action.primaryLabel}
        </button>
      </div>
    </section>
  )
}

function reviewApplicabilityAction(): PrimaryInstrumentAction {
  return {
    kind: 'REVIEW_APPLICABILITY',
    title: 'Revisar aplicabilidad del instrumento.',
    description: 'Documente el criterio profesional antes de continuar con resultados o informe.',
    primaryLabel: 'Revisar aplicabilidad',
  }
}

export function instrumentRequiresReview(entry: EvaluationInstrument, pkg?: InstrumentPackage, evaluatedAge?: string | null) {
  const hasScores = Object.values(entry.scores).some((score) => score.value.trim())
  const hasResponses = pkg ? hasResponseMaterial(pkg) : false
  const years = parseYears(evaluatedAge)
  const normativeApplicability = resolveNormativeApplicability(
    [entry.name, entry.subtitle, pkg?.name, pkg?.fingerprint.acronym],
    years,
  )
  if (hasScores) return false
  if (normativeApplicability.status === 'NOT_APPLICABLE') return true
  if (!pkg) return true
  if (pkg.readiness !== 'READY') return true
  if (!hasResponses) return true
  if (!hasScores) return true
  return false
}

function getPrimaryInstrumentAction({
  entry,
  pkg,
  hasResponses,
  hasValidResults,
  applicability,
}: {
  entry: EvaluationInstrument
  pkg?: InstrumentPackage
  hasResponses: boolean
  hasValidResults: boolean
  applicability: ApplicabilityState | null
}): PrimaryInstrumentAction {
  if (hasValidResults) {
    if (entry.report.status === 'APPROVED') {
      return {
        kind: 'FINALIZED',
        title: 'Finalizado.',
        description: 'El informe del instrumento está aprobado.',
        primaryLabel: 'Ver informe',
      }
    }

    return {
      kind: 'VIEW_RESULTS',
      title: 'Resultados disponibles.',
      description:
        applicability?.status === 'NOT_APPLICABLE'
          ? 'Consulte resultados descriptivos. Los baremos normativos quedan señalados como no aplicables por edad.'
          : 'Consulte escalas, gráficos, interpretación y evidencia antes de aprobar.',
      primaryLabel: 'Ver resultados',
    }
  }

  if (applicability?.status === 'NOT_APPLICABLE') {
    return {
      kind: 'REVIEW_APPLICABILITY',
      title: 'Revisar aplicabilidad del instrumento.',
      description: 'No se habilitan resultados normativos hasta documentar el criterio profesional sobre la edad detectada.',
      primaryLabel: 'Revisar aplicabilidad',
    }
  }

  if (!hasResponses) {
    return {
      kind: 'IMPORT_RESPONSES',
      title: 'No se detectaron respuestas del evaluado.',
      description: 'Importe una hoja contestada o registre la aplicación manual para continuar.',
      primaryLabel: 'Importar respuestas',
    }
  }

  if (pkg?.blocks.some((block) => block.id === 'items' && block.state !== 'OK')) {
    return {
      kind: 'REVIEW_STRUCTURE',
      title: 'Confirmar estructura del instrumento.',
      description: 'La estructura de ítems o escalas necesita validación antes de calcular resultados.',
      primaryLabel: 'Revisar estructura',
    }
  }

  if (pkg?.blocks.some((block) => block.id === 'baremos' && block.state !== 'OK')) {
    return {
      kind: 'REVIEW_NORMS',
      title: 'Confirmar baremos del instrumento.',
      description: 'Los baremos necesitan validación antes de interpretar percentiles o clasificaciones.',
      primaryLabel: 'Revisar baremos',
    }
  }

  return reviewStructureAction()
}

function reviewIssues(blocks: ReviewBlock[], hasResponses: boolean, applicability: ApplicabilityState | null) {
  const issues = new Set<string>()
  if (applicability?.status === 'NOT_APPLICABLE') {
    issues.add('Edad fuera del rango normativo.')
  }
  for (const block of blocks) {
    if (block.state === 'OK' && block.notes.length === 0) continue
    for (const note of block.notes) {
      const normalized = note.trim()
      if (!normalized) continue
      if (applicability?.status === 'NOT_APPLICABLE' && /respuesta/i.test(normalized) && !hasResponses) continue
      issues.add(normalized)
    }
    if (block.notes.length === 0) issues.add(`${block.label} requiere confirmación.`)
  }
  if (!hasResponses && applicability?.status !== 'NOT_APPLICABLE') {
    issues.add('Hoja de respuestas no detectada.')
  }
  return [...issues].slice(0, 3)
}

function materialChips(pkg?: InstrumentPackage) {
  if (!pkg) return []
  const present = new Set(acceptedFiles(pkg).map((file) => file.role))
  const required: PackageFileRole[] = [
    'MANUAL',
    'QUESTION_BOOKLET',
    'STIMULUS_BOOK',
    'AUTOMATED_SPREADSHEET',
    'NORMS',
    'ANSWER_SHEET',
  ]
  return required.map((role) => {
    const label = packageFileRoleLabels[role]
    const roleReview = pkg.blocks.some(
      (block) => block.state === 'REVIEW' && block.notes.some((note) => note.toLowerCase().includes(label.toLowerCase())),
    )
    const state: DetectionChipState = present.has(role) ? (roleReview ? 'review' : 'present') : 'missing'
    return { role, label, state }
  })
}

function extractionConfidence(pkg?: InstrumentPackage) {
  if (!pkg) return []
  const files = acceptedFiles(pkg).filter(
    (file) => file.confidence > 0 && !file.evidence.some((item) => /modo diseño/i.test(item)),
  )
  const average = (roles: PackageFileRole[]) => {
    const selected = files.filter((file) => roles.includes(file.role))
    if (selected.length === 0) return null
    return Math.round((selected.reduce((sum, file) => sum + file.confidence, 0) / selected.length) * 100)
  }
  return [
    { label: 'Instrumento', value: average(['MANUAL', 'QUESTION_BOOKLET', 'STIMULUS_BOOK', 'AUTOMATED_SPREADSHEET']) },
    { label: 'Estructura', value: average(['QUESTION_BOOKLET', 'STIMULUS_BOOK']) },
    { label: 'Baremos', value: average(['NORMS']) },
  ].filter((item): item is { label: string; value: number } => item.value !== null)
}

function hasResponseMaterial(pkg: InstrumentPackage) {
  return pkg.responseCandidates.some((candidate) => candidate.status === 'COMPLETED_RESPONSE') ||
    pkg.extractedResponses.some((set) => set.responses.some((response) => response.status === 'EXTRACTED'))
}

function applicabilityState(
  pkg: InstrumentPackage,
  entry: EvaluationInstrument,
  evaluatedAge?: string | null,
): ApplicabilityState | null {
  const evidence = [...pkg.findings.map((finding) => `${finding.field}: ${finding.value}`), ...pkg.blocks.flatMap((block) => block.notes)]
  const text = evidence.join(' ')
  const lower = text.toLowerCase()
  const years = parseYears(evaluatedAge)
  const normativeApplicability = resolveNormativeApplicability(
    [entry.name, entry.subtitle, pkg.name, pkg.instrumentIdentity.acronym],
    years,
  )

  if (normativeApplicability.status === 'UNKNOWN' && !/edad|adult|rango|inaplicabilidad|tipific|normativ|nino|niñ/i.test(lower)) return null

  const detectedRange = extractAgeRange(text) ?? normativeApplicability.range?.label ?? 'Rango normativo no confirmado'
  const foundation =
    evidence.find((item) => /edad|adult|rango|tipific|inaplic/i.test(item)) ??
    normativeApplicability.foundation ??
    'El material no declara un rango normativo verificable.'
  const outside =
    normativeApplicability.status === 'NOT_APPLICABLE' ||
    /fuera|adult|inaplicabilidad|discrepancia|exclusivamente|no aplic/i.test(lower)

  if (outside) {
    return {
      status: 'NOT_APPLICABLE',
      title: 'No aplicable normativamente',
      evaluatedAge: evaluatedAge ?? 'No registrado',
      detectedRange,
      foundation,
    }
  }

  return {
    status: 'APPLICABLE',
    title: 'Preparado',
    evaluatedAge: evaluatedAge ?? 'No registrado',
    detectedRange,
    foundation,
  }
}

function extractAgeRange(text: string) {
  const match = /(\d{1,2})\s*(?:a|-|-)\s*(\d{1,2})\s*a(?:ñ|n)os/i.exec(text)
  return match ? `${match[1]}-${match[2]} años` : null
}

function parseYears(age?: string | null) {
  const match = /(\d{1,2})/.exec(age ?? '')
  if (!match) return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeProfessional(...candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    const value = candidate?.trim()
    if (!value || value.toLowerCase() === 'profesional') continue
    return value
  }
  return 'No registrado'
}

function stateCopy(pkg?: InstrumentPackage) {
  if (pkg?.readiness === 'READY') return 'Analizado'
  if (pkg?.readiness === 'PARTIAL_READY') return 'Análisis parcial'
  if (pkg?.readiness === 'INSUFFICIENT_DATA') return 'Requiere datos'
  if (pkg?.readiness === 'SUPPORT_MATERIAL_ONLY') return 'Requiere datos'
  if (pkg?.readiness === 'FAILED') return 'Error'
  if (pkg) return 'Análisis parcial'
  return 'Requiere datos'
}

function reviewStructureAction(): PrimaryInstrumentAction {
  return {
    kind: 'REVIEW_STRUCTURE',
    title: 'Confirmar estructura del instrumento.',
    description: 'La estructura de ítems o escalas necesita validación antes de calcular resultados.',
    primaryLabel: 'Revisar estructura',
  }
}

