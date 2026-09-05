'use client'

import { useRef, useState } from 'react'
import { FolderOpen, Loader2, UploadCloud } from 'lucide-react'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { useSession } from '@/lib/auth/session-context'
import { buildEvaluationContext, compactContextForAI } from '@/lib/evaluations/context-service'
import type { BackupDocument, BackupDocumentType, FunctionalAreaId, InstrumentBlueprint } from '@/lib/evaluations/model'
import { addToBattery } from '@/lib/instruments/battery'
import { resolveIdentity, type IdentityMatch } from '@/lib/instruments/import/identity-resolver'
import { type InstrumentPackage, type PackageFileRole, type PackageStage } from '@/lib/instruments/import/package-model'
import { putDocument } from '@/lib/storage/documents'
import { ProcessingCard } from '@/features/evaluations/instruments/center/processing-card'
import { SelectedFilesList } from '@/features/evaluations/instruments/center/selected-files-list'

const acceptedTypes = '.rar,.zip,.pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.webp'

type ImportResult = {
  pkg: InstrumentPackage
  blueprint: InstrumentBlueprint | null
}

const readinessRank: Record<InstrumentPackage['readiness'], number> = {
  FAILED: 0,
  SUPPORT_MATERIAL_ONLY: 1,
  INSUFFICIENT_DATA: 2,
  PARTIALLY_STRUCTURED: 3,
  REQUIRES_REVIEW: 4,
  PARTIAL_READY: 5,
  READY: 6,
}

function bestReadiness(current: InstrumentPackage['readiness'], incoming: InstrumentPackage['readiness']) {
  return readinessRank[incoming] >= readinessRank[current] ? incoming : current
}

function mergeUnique<T>(items: T[], keyOf: (item: T) => string) {
  const seen = new Set<string>()
  const merged: T[] = []
  for (const item of items) {
    const key = keyOf(item)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }
  return merged
}

function mergePackage(existing: InstrumentPackage, incoming: InstrumentPackage): InstrumentPackage {
  return {
    ...existing,
    name: incoming.name ?? existing.name,
    instrumentIdentity: incoming.instrumentIdentity ?? existing.instrumentIdentity,
    originalArchive: incoming.originalArchive ?? existing.originalArchive,
    fingerprint: {
      normalizedName: incoming.fingerprint.normalizedName ?? existing.fingerprint.normalizedName,
      acronym: incoming.fingerprint.acronym ?? existing.fingerprint.acronym,
      authors: mergeUnique([...existing.fingerprint.authors, ...incoming.fingerprint.authors], (author) => author),
      version: incoming.fingerprint.version ?? existing.fingerprint.version,
      itemCount: incoming.fingerprint.itemCount ?? existing.fingerprint.itemCount,
      scales: mergeUnique([...existing.fingerprint.scales, ...incoming.fingerprint.scales], (scale) => scale),
      checksums: mergeUnique([...existing.fingerprint.checksums, ...incoming.fingerprint.checksums], (checksum) => checksum),
    },
    files: mergeUnique([...existing.files, ...incoming.files], (file) => `${file.checksum}:${file.path}:${file.role}`),
    findings: mergeUnique(
      [...existing.findings, ...incoming.findings],
      (finding) => `${finding.field}:${finding.value}:${finding.sources.map((source) => source.fileId).join(',')}`,
    ),
    computedResults: mergeUnique(
      [...existing.computedResults, ...incoming.computedResults],
      (result) =>
        `${result.measureId}:${result.label}:${result.rawValue ?? ''}:${result.transformedValue ?? ''}:${result.sourceFile}`,
    ),
    responseCandidates: mergeUnique(
      [...existing.responseCandidates, ...incoming.responseCandidates],
      (candidate) => `${candidate.fileId}:${candidate.status}:${candidate.responseCount}`,
    ),
    extractedResponses: mergeUnique(
      [...existing.extractedResponses, ...incoming.extractedResponses],
      (set) => `${set.instrumentId ?? ''}:${set.sourceFiles.join(',')}:${set.totalItemsExtracted}`,
    ),
    consistency: incoming.consistency.length > 0 ? incoming.consistency : existing.consistency,
    blocks: incoming.blocks.length > 0 ? incoming.blocks : existing.blocks,
    stage: incoming.stage,
    readiness: bestReadiness(existing.readiness, incoming.readiness),
    errorMessage: incoming.errorMessage || existing.errorMessage,
    blueprintId: incoming.blueprintId ?? existing.blueprintId,
    blueprintVersion: incoming.blueprintVersion ?? existing.blueprintVersion,
    updatedAt: new Date().toISOString(),
  }
}

function hasFunctionalAreaContent(area: { description?: string; performance?: string; observations?: string; fields?: Record<string, unknown> }) {
  return Boolean(
    area.description?.trim() ||
      area.performance?.trim() ||
      area.observations?.trim() ||
      Object.values(area.fields ?? {}).some((value) => String(value ?? '').trim().length > 0),
  )
}

function backupTypeForRole(role: PackageFileRole): BackupDocumentType {
  if (role === 'ANSWER_SHEET') return 'ANSWER_SHEET'
  if (role === 'AUTOMATED_SPREADSHEET' || role === 'SCORING_TEMPLATE' || role === 'NORMS') return 'SPREADSHEET'
  if (role === 'IMAGE') return 'PHOTO'
  return 'DOCUMENT'
}

async function persistEvidence(
  pkg: InstrumentPackage,
  sourceFiles: File[],
  evaluationId: string,
  uploadedBy: string,
): Promise<BackupDocument[]> {
  const now = new Date().toISOString()
  const backups: BackupDocument[] = []
  const direct = pkg.files.filter((file) => file.status === 'ACCEPTED' && file.extractedFrom === null)

  for (const file of direct) {
    const original = sourceFiles.find((source) => source.name === file.name && source.size === file.size)
    if (!original) continue
    try {
      const { checksum, size } = await putDocument(file.id, original)
      backups.push({
        id: file.id,
        evaluationId,
        evaluationInstrumentId: null,
        documentType: backupTypeForRole(file.role),
        name: file.name,
        mime: original.type || 'application/octet-stream',
        size,
        pages: null,
        checksum,
        uploadedBy,
        uploadedAt: now,
      })
    } catch {
      /* Evidence storage is secondary to the server-side analysis result. */
    }
  }

  if (backups.length === 0 && pkg.originalArchive) {
    const original = sourceFiles.find((source) => source.name === pkg.originalArchive?.name)
    if (original) {
      try {
        const id = crypto.randomUUID()
        const { checksum, size } = await putDocument(id, original)
        backups.push({
          id,
          evaluationId,
          evaluationInstrumentId: null,
          documentType: 'OTHER',
          name: pkg.originalArchive.name,
          mime: original.type || 'application/octet-stream',
          size,
          pages: null,
          checksum,
          uploadedBy,
          uploadedAt: now,
        })
      } catch {
        /* idem */
      }
    }
  }

  return backups
}

export function IntakeSection({
  persistenceAvailable = true,
  onCommitted,
}: {
  persistenceAvailable?: boolean
  onCommitted?: (entryId: string) => void
}) {
  const { evaluation, update, saveNow } = useEvaluation()
  const { user } = useSession()
  const [staged, setStaged] = useState<File[]>([])
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [reachedStage, setReachedStage] = useState<PackageStage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ result: ImportResult; match: IdentityMatch; sourceFiles: File[] } | null>(
    null,
  )
  const fileRef = useRef<HTMLInputElement | null>(null)
  const folderRef = useRef<HTMLInputElement | null>(null)

  const stage = (files: File[]) => {
    if (files.length === 0) return
    setStaged((current) => {
      const known = new Set(current.map((file) => `${file.name}:${file.size}`))
      return [...current, ...files.filter((file) => !known.has(`${file.name}:${file.size}`))]
    })
  }

  const unstage = (index: number) => setStaged((current) => current.filter((_, i) => i !== index))

  const commit = async ({ pkg, blueprint }: ImportResult, sourceFiles: File[]) => {
    const rawBackups = await persistEvidence(pkg, sourceFiles, evaluation.id, user.id)
    let committedEntryId = ''
    update((current) => {
      const battery = addToBattery(current.battery, {
        instrumentId: pkg.id,
        name: pkg.name ?? 'Instrumento sin identificar',
        blueprintId: pkg.blueprintId,
        applicationMode: 'IMPORTED',
        professionalId: user.id,
        professionalName: user.name,
        linkedAreas: Object.entries(current.functionalAreas)
          .filter(([, area]) => hasFunctionalAreaContent(area))
          .map(([id]) => id as FunctionalAreaId),
      })
      const newEntryId = battery[battery.length - 1].id
      committedEntryId = newEntryId
      return {
        ...current,
        instrumentPackages: [pkg, ...current.instrumentPackages],
        instrumentBlueprints: blueprint
          ? { ...current.instrumentBlueprints, [blueprint.id]: blueprint }
          : current.instrumentBlueprints,
        battery,
        backups: [...rawBackups.map((backup) => ({ ...backup, evaluationInstrumentId: newEntryId })), ...current.backups],
      }
    })
    await saveNow()
    setPending(null)
    if (committedEntryId) onCommitted?.(committedEntryId)
  }

  const mergeInto = async (
    packageId: string,
    incoming: InstrumentPackage,
    blueprint: InstrumentBlueprint | null,
    sourceFiles: File[],
  ) => {
    const existingEntry = evaluation.battery.find((entry) => entry.instrumentId === packageId)
    const rawBackups = existingEntry ? await persistEvidence(incoming, sourceFiles, evaluation.id, user.id) : []
    update((current) => ({
      ...current,
      instrumentPackages: current.instrumentPackages.map((item) =>
        item.id === packageId ? mergePackage(item, incoming) : item,
      ),
      instrumentBlueprints: blueprint
        ? { ...current.instrumentBlueprints, [blueprint.id]: blueprint }
        : current.instrumentBlueprints,
      battery: current.battery.map((entry) =>
        entry.instrumentId === packageId
          ? {
              ...entry,
              name: incoming.name ?? entry.name,
              subtitle: entry.subtitle,
              blueprintId: incoming.blueprintId ?? entry.blueprintId,
              updatedAt: new Date().toISOString(),
            }
          : entry,
      ),
      backups: existingEntry
        ? [
            ...rawBackups.map((backup) => ({ ...backup, evaluationInstrumentId: existingEntry.id })),
            ...current.backups,
          ]
        : current.backups,
    }))
    await saveNow()
    setPending(null)
    if (existingEntry) onCommitted?.(existingEntry.id)
  }

  const analyze = async () => {
    if (staged.length === 0 || !persistenceAvailable) return
    const sourceFiles = staged
    setError(null)
    setReachedStage(null)
    setBusy(true)
    setStaged([])
    setInstruction('')
    onCommitted?.('')

    try {
      const form = new FormData()
      for (const file of sourceFiles) {
        form.append('files', file)
        form.append('paths', (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name)
      }
      if (instruction.trim()) form.append('instruction', instruction.trim())
      form.append('context', JSON.stringify(compactContextForAI(buildEvaluationContext(evaluation))))

      const response = await fetch(`/api/evaluations/${evaluation.id}/instrument-package`, {
        method: 'POST',
        body: form,
      })
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'No fue posible procesar el material.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let donePayload: { package?: InstrumentPackage; blueprint?: InstrumentBlueprint | null; notices?: string[] } | null =
        null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newlineIndex: number
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIndex)
          buffer = buffer.slice(newlineIndex + 1)
          if (!line.trim()) continue
          const event = JSON.parse(line) as
            | { type: 'stage'; stage: PackageStage }
            | { type: 'done'; package: InstrumentPackage; blueprint: InstrumentBlueprint | null; notices: string[] }
            | { type: 'error'; message: string }
          if (event.type === 'stage') setReachedStage(event.stage)
          else if (event.type === 'done') donePayload = event
          else if (event.type === 'error') throw new Error(event.message)
        }
      }

      if (!donePayload?.package) throw new Error('El servidor no completó el procesamiento.')

      const result = { pkg: donePayload.package, blueprint: donePayload.blueprint ?? null }
      const match = resolveIdentity(result.pkg.fingerprint, evaluation.instrumentPackages)

      if (match.kind === 'NEW') await commit(result, sourceFiles)
      else if (match.kind === 'DUPLICATE') {
        const existingEntry = evaluation.battery.find((entry) => 'packageId' in match && entry.instrumentId === match.packageId)
        setPending(null)
        if (existingEntry) onCommitted?.(existingEntry.id)
      } else setPending({ result, match, sourceFiles })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No fue posible procesar el material.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
      if (folderRef.current) folderRef.current.value = ''
    }
  }

  return (
    <>
      <section
        className="dt-ai-upload"
        aria-labelledby="incorporar-instrumento-title"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          stage([...event.dataTransfer.files])
        }}
      >
        <div className="dt-ai-upload-copy">
          <span className="dt-ai-upload-icon" aria-hidden="true">
            <UploadCloud />
          </span>
          <h3 id="incorporar-instrumento-title">Nuevo análisis</h3>
          <p>Cargue el material disponible para su análisis.</p>
          <small>PDF · DOCX · XLS/XLSX · JPG/PNG · ZIP/RAR</small>
          {error ? <p className="dt-ai-error">{error}</p> : null}
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept={acceptedTypes}
          className="sr-only"
          onChange={(event) => stage([...(event.target.files ?? [])])}
        />
        <input
          ref={folderRef}
          type="file"
          multiple
          className="sr-only"
          // @ts-expect-error atributo no estándar, soportado por navegadores de escritorio
          webkitdirectory=""
          directory=""
          onChange={(event) => stage([...(event.target.files ?? [])])}
        />

        <div className="dt-upload-actions">
          <button type="button" className="dt-btn dt-btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
            <UploadCloud aria-hidden="true" />
            Seleccionar archivos
          </button>
          <button
            type="button"
            className="dt-btn dt-btn-secondary"
            disabled={busy}
            onClick={() => folderRef.current?.click()}
          >
            <FolderOpen aria-hidden="true" />
            Seleccionar carpeta
          </button>
        </div>
      </section>

      <SelectedFilesList files={staged} onRemove={unstage} onClear={() => setStaged([])} />

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
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Agregue una indicación opcional para orientar el análisis."
        />

        <div className="dt-ai-actions">
          <button
            type="button"
            className="dt-btn dt-btn-primary"
            disabled={busy || staged.length === 0 || !persistenceAvailable}
            title={!persistenceAvailable ? 'Restablece la conexión para continuar.' : undefined}
            onClick={() => void analyze()}
          >
            {busy ? <Loader2 className="dt-spin" aria-hidden="true" /> : null}
            {busy ? 'Analizando instrumento...' : 'Analizar instrumento'}
          </button>
        </div>
      </section>

      {busy ? <ProcessingCard reachedStage={reachedStage} /> : null}

      {pending ? (
        <IdentityPrompt
          pending={pending}
          onMerge={() =>
            'packageId' in pending.match &&
            void mergeInto(pending.match.packageId, pending.result.pkg, pending.result.blueprint, pending.sourceFiles)
          }
          onSeparate={() => void commit(pending.result, pending.sourceFiles)}
          onDiscard={() => setPending(null)}
        />
      ) : null}
    </>
  )
}

function IdentityPrompt({
  pending,
  onMerge,
  onSeparate,
  onDiscard,
}: {
  pending: { result: ImportResult; match: IdentityMatch; sourceFiles: File[] }
  onMerge: () => void
  onSeparate: () => void
  onDiscard: () => void
}) {
  const { match } = pending

  return (
    <section className="dt-ai-section" aria-labelledby="identidad-title">
      <div className="dt-ai-section-head">
        <div>
          <div>
            <h3 id="identidad-title">Completar instrumento existente</h3>
            <p>{match.detail}</p>
          </div>
        </div>
      </div>

      <div className="dt-ai-actions">
        {match.kind === 'DUPLICATE' ? (
          <button type="button" className="dt-btn dt-btn-secondary dt-btn-sm" onClick={onDiscard}>
            Entendido
          </button>
        ) : (
          <>
            <button type="button" className="dt-btn dt-btn-primary dt-btn-sm" onClick={onMerge}>
              Agregar al instrumento existente
            </button>
            <button type="button" className="dt-btn dt-btn-secondary dt-btn-sm" onClick={onSeparate}>
              {match.kind === 'POSSIBLE_VERSION' ? 'Crear nueva versión' : 'Incorporar por separado'}
            </button>
            <button type="button" className="dt-btn dt-btn-ghost dt-btn-sm" onClick={onDiscard}>
              Cancelar
            </button>
          </>
        )}
      </div>
    </section>
  )
}

