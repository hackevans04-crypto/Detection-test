'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Eye, Info, Lightbulb, Pencil, RefreshCw, Trash2, X } from 'lucide-react'
import { EntryList } from '@/features/evaluations/components/entry-list'
import { StepCard } from '@/features/evaluations/workspace/evaluation-workspace'
import { StepFooter } from '@/features/evaluations/workspace/step-footer'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { evaluationEvidence } from '@/lib/evaluations/evidence'
import {
  acceptedConclusions,
  buildConclusionEvidence,
  hasValidConclusionEvidence,
  type AIDraft,
} from '@/lib/evaluations/conclusion-evidence'
import { newTextEntry, type TextEntry } from '@/lib/evaluations/model'

export function ConclusionsStep() {
  const { evaluation, update } = useEvaluation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const evidence = evaluationEvidence(evaluation)
  const conclusionEvidence = useMemo(() => buildConclusionEvidence(evaluation), [evaluation])
  const currentVersion = conclusionEvidence.evidenceVersion
  const hasUsableEvidence = conclusionEvidence.suggestedConclusions.length > 0
  const showDebug =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('conclusionDebug') === '1'

  const persistedEntries = evaluation.conclusions.filter((entry) => entry.status !== 'DISCARDED')
  const persistedIds = new Set(persistedEntries.map((entry) => entry.id))
  const generatedEntries = conclusionEvidence.suggestedConclusions
    .filter((draft) => !persistedIds.has(draft.id))
    .map(aiDraftToEntry)
  const entries = hasUsableEvidence ? [...persistedEntries, ...generatedEntries] : persistedEntries
  const accepted = acceptedConclusions(evaluation).filter((entry) => hasValidConclusionEvidence(entry, currentVersion))
  const aiEntries = entries.filter((entry) => entry.source === 'AI' || entry.source === 'AI_ASSISTED')
  const currentDrafts = aiEntries.filter((entry) => entry.status === 'AI_DRAFT' && entry.evidenceVersion === currentVersion)
  const staleDrafts = aiEntries.filter(
    (entry) =>
      entry.evidenceVersion &&
      entry.evidenceVersion !== currentVersion &&
      entry.status !== 'ACCEPTED' &&
      entry.status !== 'EDITED_ACCEPTED' &&
      entry.status !== 'DISCARDED',
  )
  const acceptedIds = new Set(accepted.map((entry) => entry.id))
  const manualEntries = evaluation.conclusions.filter(
    (entry) => (!entry.source || entry.source === 'MANUAL') && entry.status !== 'DISCARDED',
  )
  const reviewedCount = accepted.length
  const pendingCount = currentDrafts.length + staleDrafts.length

  useEffect(() => {
    if (!hasUsableEvidence) return
    const hasCurrentGeneration = evaluation.conclusions.some(
      (entry) => entry.source === 'AI' && entry.evidenceVersion === currentVersion,
    )
    if (hasCurrentGeneration) return
    update((current) => {
      const currentIds = new Set(current.conclusions.map((entry) => entry.id))
      return {
        ...current,
        conclusions: [
          ...current.conclusions,
          ...conclusionEvidence.suggestedConclusions.filter((draft) => !currentIds.has(draft.id)).map(aiDraftToEntry),
        ],
      }
    })
  }, [conclusionEvidence.suggestedConclusions, currentVersion, evaluation.conclusions, hasUsableEvidence, update])

  const setEntry = (entryId: string, mutate: (entry: TextEntry) => TextEntry) => {
    update((current) => ({
      ...current,
      conclusions: current.conclusions.map((entry) => (entry.id === entryId ? mutate(entry) : entry)),
    }))
  }

  const acceptEntry = (entryId: string) => {
    update((current) => {
      const draft = conclusionEvidence.suggestedConclusions.find((item) => item.id === entryId)
      const accept = (entry: TextEntry): TextEntry => ({
        ...entry,
        status: entry.status === 'PROFESSIONAL_EDIT' ? 'EDITED_ACCEPTED' : 'ACCEPTED',
        acceptedAt: new Date().toISOString(),
        acceptedBy: evaluation.evaluatorId,
      })
      if (current.conclusions.some((entry) => entry.id === entryId)) {
        return {
          ...current,
          conclusions: current.conclusions.map((entry) => (entry.id === entryId ? accept(entry) : entry)),
        }
      }
      return draft ? { ...current, conclusions: [...current.conclusions, accept(aiDraftToEntry(draft))] } : current
    })
  }

  const discardEntry = (entryId: string) => {
    setEntry(entryId, (entry) => ({ ...entry, status: 'DISCARDED' }))
  }

  const regenerateEntry = (entryId: string) => {
    const source = conclusionEvidence.suggestedConclusions.find((draft) => draft.id === entryId)
    setEntry(entryId, (entry) => ({
      ...entry,
      text: source?.text ?? entry.originalAiText ?? entry.text,
      status: 'AI_DRAFT',
      source: 'AI',
      evidenceVersion: currentVersion,
      acceptedAt: undefined,
      acceptedBy: undefined,
    }))
  }

  const regenerateAll = () => {
    const hasProfessionalWork = evaluation.conclusions.some(
      (entry) => entry.source === 'AI_ASSISTED' || entry.status === 'PROFESSIONAL_EDIT' || entry.status === 'EDITED_ACCEPTED',
    )
    if (hasProfessionalWork && !window.confirm('Hay ediciones profesionales. Se conservaran y se agregaran borradores nuevos.')) {
      return
    }
    update((current) => ({
      ...current,
      conclusions: [
        ...current.conclusions.filter((entry) => entry.status !== 'AI_DRAFT'),
        ...conclusionEvidence.suggestedConclusions.map(aiDraftToEntry),
      ],
    }))
  }

  const startEdit = (entry: TextEntry) => {
    setEditingId(entry.id)
    setEditingText(entry.text)
  }

  const saveEdit = (entryId: string) => {
    const text = editingText.trim()
    if (!text) return
    setEntry(entryId, (entry) => ({
      ...entry,
      text,
      source: entry.source === 'AI' ? 'AI_ASSISTED' : entry.source,
      status: entry.source === 'AI' || entry.source === 'AI_ASSISTED' ? 'EDITED_ACCEPTED' : entry.status,
      acceptedAt: entry.source === 'AI' || entry.source === 'AI_ASSISTED' ? new Date().toISOString() : entry.acceptedAt,
      acceptedBy: entry.source === 'AI' || entry.source === 'AI_ASSISTED' ? evaluation.evaluatorId : entry.acceptedBy,
    }))
    setEditingId(null)
    setEditingText('')
  }

  return (
    <StepCard
      step="conclusiones"
      description="Detection AI prepara conclusiones desde la evidencia registrada. El profesional revisa, edita, acepta o descarta antes de continuar."
      aside={
        <span className="dt-badge" data-tone={reviewedCount > 0 ? 'primary' : 'neutral'}>
          {aiEntries.length} generadas - {reviewedCount} aceptadas
        </span>
      }
    >
      <div className="dt-conclusions-workspace">
        <aside className="dt-block dt-evidence-summary">
          <h3 className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
            Resumen de evidencia
          </h3>
          <p className="mt-1 text-xs" style={{ color: 'var(--dt-muted)' }}>
            Evidencia disponible para consultar sin alargar la redaccion principal.
          </p>

          <div className="mt-4 grid gap-4">
            {evidence.map((group) => (
              <details key={group.id} className="dt-evidence-accordion">
                <summary>{group.title}</summary>
                <dl className="dt-meta-list mt-2">
                  {group.items.map((item) => (
                    <div key={`${group.id}-${item.label}`}>
                      <dt>{item.label}</dt>
                      <dd
                        style={{
                          whiteSpace: 'pre-wrap',
                          color:
                            item.tone === 'danger'
                              ? 'var(--dt-danger)'
                              : item.tone === 'warning'
                                ? 'var(--dt-warning)'
                                : undefined,
                        }}
                      >
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            ))}
          </div>

          <p className="dt-note mt-5">
            <Info aria-hidden="true" />
            Los datos calculados apoyan la conclusion, pero no la sustituyen ni constituyen un diagnostico clinico.
          </p>
        </aside>

        <div className="dt-conclusion-panel">
          <section className="dt-ai-section dt-conclusion-drafts" aria-labelledby="conclusiones-ai-title">
            <div className="dt-ai-section-head">
              <div>
                <div>
                  <h3 id="conclusiones-ai-title">
                    <Lightbulb aria-hidden="true" />
                    Conclusiones profesionales
                  </h3>
                  <p>
                    Detection AI preparo {aiEntries.length} borradores. {reviewedCount} aceptadas - {pendingCount} pendientes.
                  </p>
                </div>
              </div>
              <div className="dt-draft-primary-actions">
                <button
                  type="button"
                  className="dt-btn dt-btn-secondary dt-btn-sm"
                  onClick={regenerateAll}
                  disabled={!hasUsableEvidence}
                >
                  <RefreshCw aria-hidden="true" />
                  Regenerar borradores
                </button>
              </div>
            </div>

            {staleDrafts.length > 0 ? (
              <div className="dt-ai-stale-note">
                Los resultados cambiaron desde que se generaron algunas conclusiones. Actualice con Detection AI antes de aceptarlas.
              </div>
            ) : null}

            {hasUsableEvidence ? (
              <ol className="dt-ai-draft-list">
                {entries.map((entry, index) => (
                  <li
                    key={entry.id}
                    className="dt-ai-draft-card"
                    data-accepted={acceptedIds.has(entry.id) ? 'true' : 'false'}
                    data-stale={entry.evidenceVersion && entry.evidenceVersion !== currentVersion ? 'true' : 'false'}
                  >
                    <header>
                      <span className="dt-ai-draft-mark">{index + 1}</span>
                      <div>
                        <strong>{entry.title ?? 'Conclusion profesional'}</strong>
                        <small>
                          {statusLabel(entry)}
                          {entry.confidence ? ` - Confianza ${entry.confidence}` : ''}
                        </small>
                      </div>
                    </header>

                    {editingId === entry.id ? (
                      <div className="dt-entry-editor">
                        <textarea
                          className="dt-textarea"
                          value={editingText}
                          rows={4}
                          autoFocus
                          aria-label="Texto de la conclusion"
                          onChange={(event) => setEditingText(event.target.value)}
                        />
                        <div className="dt-entry-editor-actions">
                          <button type="button" className="dt-btn dt-btn-primary dt-btn-sm" onClick={() => saveEdit(entry.id)}>
                            <Check aria-hidden="true" />
                            Guardar y aceptar
                          </button>
                          <button
                            type="button"
                            className="dt-btn dt-btn-ghost dt-btn-sm"
                            onClick={() => {
                              setEditingId(null)
                              setEditingText('')
                            }}
                          >
                            <X aria-hidden="true" />
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p>{entry.text}</p>
                    )}

                    <details className="dt-ai-draft-evidence">
                      <summary>
                        <Eye aria-hidden="true" />
                        Ver evidencia utilizada
                      </summary>
                      <ul>
                        {(entry.evidenceRefs ?? []).map((source) => (
                          <li key={`${entry.id}-${source}`}>{source}</li>
                        ))}
                      </ul>
                    </details>

                    <div className="dt-ai-draft-actions">
                      {!acceptedIds.has(entry.id) ? (
                        <button
                          type="button"
                          className="dt-btn dt-btn-primary dt-btn-sm"
                          onClick={() => acceptEntry(entry.id)}
                          disabled={entry.evidenceVersion !== currentVersion && Boolean(entry.evidenceVersion)}
                        >
                          <Check aria-hidden="true" />
                          Aceptar
                        </button>
                      ) : null}
                      <button type="button" className="dt-btn dt-btn-secondary dt-btn-sm" onClick={() => startEdit(entry)}>
                        <Pencil aria-hidden="true" />
                        Editar
                      </button>
                      {entry.source === 'AI' || entry.source === 'AI_ASSISTED' ? (
                        <button type="button" className="dt-btn dt-btn-secondary dt-btn-sm" onClick={() => regenerateEntry(entry.id)}>
                          <RefreshCw aria-hidden="true" />
                          Regenerar
                        </button>
                      ) : null}
                      <button type="button" className="dt-btn dt-btn-ghost dt-btn-sm" onClick={() => discardEntry(entry.id)}>
                        <Trash2 aria-hidden="true" />
                        Descartar
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="dt-ai-empty-state">
                <strong>No hay evidencia suficiente para generar conclusiones automaticas.</strong>
                <p>{conclusionEvidence.insufficientEvidence.join(' ')}</p>
              </div>
            )}

            {showDebug ? (
              <details className="dt-ai-draft-evidence mt-4" open>
                <summary>Debug de evidencia</summary>
                <pre className="dt-debug-json">{JSON.stringify(conclusionEvidence.debug, null, 2)}</pre>
              </details>
            ) : null}
          </section>

          <section className="dt-ai-section dt-manual-fallback mt-4">
            <div className="dt-ai-section-head">
              <div>
                <div>
                  <h3>Agregar conclusion manual</h3>
                  <p>Use esta opcion solo si necesita registrar una conclusion profesional fuera del borrador asistido.</p>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <EntryList
                entries={manualEntries}
                onChange={(next) =>
                  update((current) => ({
                    ...current,
                    conclusions: [
                      ...current.conclusions.filter((entry) => entry.source && entry.source !== 'MANUAL'),
                      ...next.map((entry) => ({ ...entry, source: 'MANUAL' as const, status: 'ACCEPTED' as const })),
                    ],
                  }))
                }
                addLabel="Anadir conclusion"
                placeholder="Hallazgo concreto, con la evidencia que lo respalda..."
                emptyText="Sin conclusiones manuales."
              />
            </div>
          </section>
        </div>
      </div>

      <StepFooter
        step="conclusiones"
        disableNext={accepted.length === 0}
        disabledNextReason="Revise y acepte al menos una conclusion para continuar."
        onBeforeNext={() => {
          if (accepted.length > 0) return true
          window.alert('Revise y acepte al menos una conclusion para continuar.')
          return false
        }}
      />
    </StepCard>
  )
}

function aiDraftToEntry(draft: AIDraft): TextEntry {
  return {
    ...newTextEntry(draft.text, {
    title: draft.title,
    source: 'AI',
    status: 'AI_DRAFT',
    evidenceRefs: draft.sourceRefs,
    evidenceVersion: draft.evidenceVersion,
    confidence: draft.confidence,
    needsReview: draft.needsReview,
    originalAiText: draft.text,
    }),
    id: draft.id,
  }
}

function statusLabel(entry: TextEntry) {
  if (entry.status === 'EDITED_ACCEPTED') return 'Editada por profesional - Aceptada'
  if (entry.status === 'ACCEPTED') return entry.source === 'AI' ? 'Aceptada' : 'Manual aceptada'
  if (entry.status === 'PROFESSIONAL_EDIT') return 'Editada por profesional'
  if (entry.status === 'STALE') return 'Requiere revision'
  return 'Borrador IA'
}
