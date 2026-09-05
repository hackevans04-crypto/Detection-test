'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Check,
  CircleDashed,
  ClipboardCheck,
  GraduationCap,
  Home,
  Info,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { EntryList } from '@/features/evaluations/components/entry-list'
import { StepCard } from '@/features/evaluations/workspace/evaluation-workspace'
import { StepFooter } from '@/features/evaluations/workspace/step-footer'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { buildRecommendationEvidence, type AIDraft } from '@/lib/evaluations/conclusion-evidence'
import {
  newTextEntry,
  recommendationGroupIds,
  recommendationGroupLabels,
  type Evaluation,
  type RecommendationGroupId,
  type TextEntry,
} from '@/lib/evaluations/model'

const groupMeta: Record<
  RecommendationGroupId,
  { icon: typeof Users; purpose: string; placeholder: string }
> = {
  docentes: {
    icon: GraduationCap,
    purpose:
      'Adaptaciones curriculares, trabajo individualizado, ubicacion en el aula, refuerzo academico y estrategias de ensenanza.',
    placeholder: 'Ej. Ubicar al estudiante en un lugar del aula con menos distractores...',
  },
  'pedagogo-apoyo': {
    icon: Users,
    purpose:
      'Coordinacion profesional, elaboracion y seguimiento de adaptaciones curriculares y registro del proceso.',
    placeholder: 'Ej. Elaborar el DIAC junto al docente y revisar su cumplimiento cada trimestre...',
  },
  dece: {
    icon: Building2,
    purpose: 'Coordinaciones internas, derivaciones, registros institucionales y seguimiento del caso.',
    placeholder: 'Ej. Mantener registro del seguimiento y coordinar con los profesionales implicados...',
  },
  'representante-legal': {
    icon: Home,
    purpose:
      'Seguimiento academico, apoyo en tareas, comunicacion con la institucion, autoestima y gestion de valoraciones profesionales.',
    placeholder: 'Ej. Acompanar la realizacion de tareas en un espacio sin distractores...',
  },
  psicopedagogo: {
    icon: ClipboardCheck,
    purpose: 'Socializacion del informe, confidencialidad y seguimiento de los profesionales involucrados.',
    placeholder: 'Ej. Socializar el informe con los profesionales implicados resguardando la confidencialidad...',
  },
}

function isUsableRecommendation(entry: TextEntry) {
  if (!entry.text.trim()) return false
  if (entry.status === 'AI_DRAFT' || entry.status === 'DISCARDED' || entry.status === 'STALE') return false
  if (entry.source === 'AI' && !entry.status) return false
  return entry.status === 'ACCEPTED' || entry.status === 'EDITED_ACCEPTED' || entry.source === 'MANUAL' || !entry.status
}

function aiDraftToEntry(draft: AIDraft): TextEntry {
  return newTextEntry(draft.text, {
    title: draft.title,
    source: 'AI',
    status: 'AI_DRAFT',
    evidenceRefs: draft.sourceRefs,
    evidenceVersion: draft.evidenceVersion,
    confidence: draft.confidence,
    needsReview: draft.needsReview,
    originalAiText: draft.text,
  })
}

function sameDraft(entry: TextEntry, draft: AIDraft) {
  return entry.originalAiText === draft.text || entry.text.trim() === draft.text.trim() || entry.id === draft.id
}

function syncRecommendationDrafts(evaluation: Evaluation) {
  const evidence = buildRecommendationEvidence(evaluation)
  let changed = false
  const recommendations = { ...evaluation.recommendations }

  for (const group of recommendationGroupIds) {
    const current = recommendations[group]
    const missing = evidence.suggestedRecommendations[group].filter(
      (draft) => !current.some((entry) => sameDraft(entry, draft)),
    )
    if (missing.length > 0) {
      changed = true
      recommendations[group] = [...current, ...missing.map(aiDraftToEntry)]
    }
  }

  return changed ? { ...evaluation, recommendations } : evaluation
}

function acceptEntry(entry: TextEntry): TextEntry {
  return {
    ...entry,
    source: entry.source === 'AI' ? 'AI_ASSISTED' : entry.source ?? 'MANUAL',
    status: entry.status === 'AI_DRAFT' ? 'ACCEPTED' : entry.status ?? 'ACCEPTED',
    acceptedAt: entry.acceptedAt ?? new Date().toISOString(),
  }
}

function replaceGroupEntries(evaluation: Evaluation, group: RecommendationGroupId, entries: TextEntry[]) {
  const preservedDrafts = evaluation.recommendations[group].filter(
    (entry) => entry.status === 'AI_DRAFT' || entry.status === 'DISCARDED' || entry.status === 'STALE',
  )
  return {
    ...evaluation,
    recommendations: {
      ...evaluation.recommendations,
      [group]: [
        ...entries.map((entry) =>
          entry.source === 'AI' || entry.source === 'AI_ASSISTED'
            ? { ...entry, status: entry.status ?? 'ACCEPTED' }
            : { ...entry, source: entry.source ?? 'MANUAL', status: entry.status ?? 'ACCEPTED' },
        ),
        ...preservedDrafts,
      ],
    },
  }
}

export function RecommendationsStep() {
  const { evaluation, update } = useEvaluation()
  const [groupId, setGroupId] = useState<RecommendationGroupId>('docentes')

  useEffect(() => {
    const synced = syncRecommendationDrafts(evaluation)
    if (synced !== evaluation) {
      update(() => synced)
    }
  }, [evaluation, update])

  const recommendationEvidence = useMemo(() => buildRecommendationEvidence(evaluation), [evaluation])
  const meta = groupMeta[groupId]

  const acceptedByGroup = (group: RecommendationGroupId) =>
    evaluation.recommendations[group].filter(isUsableRecommendation)
  const draftsByGroup = (group: RecommendationGroupId) =>
    evaluation.recommendations[group].filter((entry) => entry.status === 'AI_DRAFT' && entry.text.trim())

  const acceptedEntries = acceptedByGroup(groupId)
  const draftEntries = draftsByGroup(groupId)
  const total = recommendationGroupIds.reduce((sum, group) => sum + acceptedByGroup(group).length, 0)
  const draftTotal = recommendationGroupIds.reduce((sum, group) => sum + draftsByGroup(group).length, 0)
  const groupsWritten = recommendationGroupIds.filter((group) => acceptedByGroup(group).length > 0).length

  const updateGroup = (next: TextEntry[]) => {
    update((current) => replaceGroupEntries(current, groupId, next))
  }

  const acceptDraft = (entryId: string) => {
    update((current) => ({
      ...current,
      recommendations: {
        ...current.recommendations,
        [groupId]: current.recommendations[groupId].map((entry) =>
          entry.id === entryId ? acceptEntry(entry) : entry,
        ),
      },
    }))
  }

  const discardDraft = (entryId: string) => {
    update((current) => ({
      ...current,
      recommendations: {
        ...current.recommendations,
        [groupId]: current.recommendations[groupId].map((entry) =>
          entry.id === entryId ? { ...entry, status: 'DISCARDED' } : entry,
        ),
      },
    }))
  }

  const acceptCurrentGroup = () => {
    update((current) => ({
      ...current,
      recommendations: {
        ...current.recommendations,
        [groupId]: current.recommendations[groupId].map((entry) =>
          entry.status === 'AI_DRAFT' ? acceptEntry(entry) : entry,
        ),
      },
    }))
  }

  const acceptAllGroups = () => {
    update((current) => {
      const synced = syncRecommendationDrafts(current)
      return {
        ...synced,
        recommendations: Object.fromEntries(
          recommendationGroupIds.map((group) => [
            group,
            synced.recommendations[group].map((entry) => (entry.status === 'AI_DRAFT' ? acceptEntry(entry) : entry)),
          ]),
        ) as Evaluation['recommendations'],
      }
    })
  }

  return (
    <StepCard
      step="recomendaciones"
      description="Revise, ajuste e incorpore recomendaciones por destinatario. El informe final usa solo recomendaciones aceptadas o escritas manualmente."
      aside={
        <span className="dt-badge" data-tone={total > 0 ? 'primary' : 'neutral'}>
          {total} {total === 1 ? 'incorporada' : 'incorporadas'} · {groupsWritten} de{' '}
          {recommendationGroupIds.length} destinatarios
        </span>
      }
    >
      <div className="dt-recommendations-workspace dt-substep">
        <nav className="dt-substep-nav" aria-label="Destinatarios de las recomendaciones">
          {recommendationGroupIds.map((group) => {
            const count = acceptedByGroup(group).length
            const drafts = draftsByGroup(group).length
            return (
              <button
                key={group}
                type="button"
                className="dt-substep-item"
                aria-current={group === groupId ? 'true' : undefined}
                onClick={() => setGroupId(group)}
              >
                <span className="dt-substep-mark" data-complete={count > 0} aria-hidden="true">
                  {count > 0 ? <Check /> : <CircleDashed />}
                </span>
                <span className="dt-substep-label">{recommendationGroupLabels[group]}</span>
                {drafts > 0 ? <span className="dt-substep-count">{drafts}</span> : null}
              </button>
            )
          })}
        </nav>

        <div className="dt-substep-body">
          <header className="dt-substep-head">
            <h3>
              <meta.icon className="mr-2 inline size-4 align-[-3px]" style={{ color: 'var(--dt-primary)' }} aria-hidden="true" />
              Recomendaciones para {recommendationGroupLabels[groupId].toLowerCase()}
            </h3>
            <p>{meta.purpose}</p>
          </header>

          {draftEntries.length > 0 ? (
            <section className="dt-ai-section dt-recommendation-drafts" aria-labelledby="recomendaciones-sugeridas-title">
              <div className="dt-ai-section-head">
                <div>
                  <h3 id="recomendaciones-sugeridas-title">
                    <Sparkles aria-hidden="true" />
                    Sugerencias listas para revisar
                  </h3>
                  <p>Se generan desde conclusiones aceptadas y quedan fuera del informe hasta que las incorpore.</p>
                </div>
                <button type="button" className="dt-btn dt-btn-secondary dt-btn-sm" onClick={acceptCurrentGroup}>
                  <Check aria-hidden="true" />
                  Usar sugerencias
                </button>
              </div>

              <ol className="dt-ai-draft-list">
                {draftEntries.map((entry) => (
                  <li key={entry.id} className="dt-recommendation-card">
                    <div>
                      <strong>{entry.title ?? 'Recomendacion sugerida'}</strong>
                      <p>{entry.text}</p>
                      <details>
                        <summary>Ver fundamento</summary>
                        <span>
                          {(entry.evidenceRefs ?? []).slice(0, 4).join(' · ') || 'Conclusiones aceptadas'}
                        </span>
                      </details>
                    </div>
                    <div className="dt-recommendation-actions">
                      <button type="button" className="dt-btn dt-btn-primary dt-btn-sm" onClick={() => acceptDraft(entry.id)}>
                        <Check aria-hidden="true" />
                        Usar
                      </button>
                      <button type="button" className="dt-btn dt-btn-ghost dt-btn-sm" onClick={() => discardDraft(entry.id)}>
                        <X aria-hidden="true" />
                        Descartar
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : recommendationEvidence.conclusions.length === 0 ? (
            <p className="dt-note">
              <Info aria-hidden="true" />
              Acepte conclusiones en el paso anterior para que Detection AI prepare recomendaciones trazables.
            </p>
          ) : null}

          <EntryList
            entries={acceptedEntries}
            onChange={updateGroup}
            addLabel="Añadir recomendación"
            placeholder={meta.placeholder}
            emptyText={`Todavia no hay recomendaciones incorporadas para ${recommendationGroupLabels[groupId].toLowerCase()}.`}
          />

          <p className="dt-note mt-5">
            <Info aria-hidden="true" />
            El informe solo incluye recomendaciones incorporadas; los borradores descartados o pendientes no completan esta etapa.
          </p>
        </div>
      </div>

      <StepFooter
        step="recomendaciones"
        disableNext={total === 0}
        disabledNextReason="Incorpore al menos una recomendacion antes de continuar."
        extraActions={
          draftTotal > 0 ? (
            <button type="button" className="dt-btn dt-btn-secondary" onClick={acceptAllGroups}>
              <Check aria-hidden="true" />
              Usar todas
            </button>
          ) : null
        }
        onBeforeNext={() => {
          if (total > 0) return true
          window.alert('Incorpore al menos una recomendacion antes de continuar al informe final.')
          return false
        }}
      />
    </StepCard>
  )
}
