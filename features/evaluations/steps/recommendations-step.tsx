'use client'

import { useState } from 'react'
import { Building2, Check, CircleDashed, ClipboardCheck, GraduationCap, Home, Info, Users } from 'lucide-react'
import { EntryList } from '@/features/evaluations/components/entry-list'
import { StepCard } from '@/features/evaluations/workspace/evaluation-workspace'
import { StepFooter } from '@/features/evaluations/workspace/step-footer'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import {
  recommendationGroupIds,
  recommendationGroupLabels,
  type RecommendationGroupId,
} from '@/lib/evaluations/model'

/**
 * Metadatos de cada destinatario, tomados de lo que el informe le pide a cada
 * uno. El destinatario no es una etiqueta decorativa: cambia qué se recomienda
 * y quién responde de ello.
 */
const groupMeta: Record<
  RecommendationGroupId,
  { icon: typeof Users; purpose: string; placeholder: string }
> = {
  docentes: {
    icon: GraduationCap,
    purpose:
      'Adaptaciones curriculares, trabajo individualizado, ubicación en el aula, refuerzo académico y estrategias de enseñanza.',
    placeholder: 'Ej. Ubicar al estudiante en un lugar del aula con menos distractores…',
  },
  'pedagogo-apoyo': {
    icon: Users,
    purpose:
      'Coordinación profesional, elaboración y seguimiento de adaptaciones curriculares y registro del proceso.',
    placeholder: 'Ej. Elaborar el DIAC junto al docente y revisar su cumplimiento cada trimestre…',
  },
  dece: {
    icon: Building2,
    purpose: 'Coordinaciones internas, derivaciones, registros institucionales y seguimiento del caso.',
    placeholder: 'Ej. Mantener registro del seguimiento y coordinar con los profesionales implicados…',
  },
  'representante-legal': {
    icon: Home,
    purpose:
      'Seguimiento académico, apoyo en tareas, comunicación con la institución, autoestima y gestión de valoraciones profesionales.',
    placeholder: 'Ej. Acompañar la realización de tareas en un espacio sin distractores…',
  },
  psicopedagogo: {
    icon: ClipboardCheck,
    purpose: 'Socialización del informe, confidencialidad y seguimiento de los profesionales involucrados.',
    placeholder: 'Ej. Socializar el informe con los profesionales implicados resguardando la confidencialidad…',
  },
}

/**
 * Recomendaciones por destinatario.
 *
 * Cada recomendación se guarda por separado y con su destinatario, porque así
 * es como se emiten y como se hace después el seguimiento. El sistema no
 * sugiere ningún texto: no existe regla documentada que permita derivarlas de
 * los resultados, y redactarlas por el profesional sería inventarlas.
 */
export function RecommendationsStep() {
  const { evaluation, update } = useEvaluation()
  const [groupId, setGroupId] = useState<RecommendationGroupId>('docentes')

  const countOf = (group: RecommendationGroupId) =>
    evaluation.recommendations[group].filter((entry) => entry.text.trim()).length

  const total = recommendationGroupIds.reduce((sum, group) => sum + countOf(group), 0)
  const groupsWritten = recommendationGroupIds.filter((group) => countOf(group) > 0).length
  const meta = groupMeta[groupId]

  return (
    <StepCard
      step="recomendaciones"
      description="Redacta las recomendaciones por destinatario. Cada una se guarda por separado; el informe incluye sólo los destinatarios con recomendaciones escritas."
      aside={
        <span className="dt-badge" data-tone={total > 0 ? 'primary' : 'neutral'}>
          {total} {total === 1 ? 'recomendación' : 'recomendaciones'} · {groupsWritten} de{' '}
          {recommendationGroupIds.length} destinatarios
        </span>
      }
    >
      <div className="dt-substep">
        <nav className="dt-substep-nav" aria-label="Destinatarios de las recomendaciones">
          {recommendationGroupIds.map((group) => {
            const count = countOf(group)
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
                {recommendationGroupLabels[group]}
                <span className="dt-sr-only">
                  {count > 0 ? `(${count} redactadas)` : '(sin recomendaciones)'}
                </span>
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

          <EntryList
            entries={evaluation.recommendations[groupId]}
            onChange={(next) =>
              update((current) => ({
                ...current,
                recommendations: { ...current.recommendations, [groupId]: next },
              }))
            }
            addLabel="Añadir recomendación"
            placeholder={meta.placeholder}
            emptyText={`Todavía no hay recomendaciones para ${recommendationGroupLabels[groupId].toLowerCase()}.`}
          />

          <p className="dt-note mt-5">
            <Info aria-hidden="true" />
            El sistema no genera recomendaciones automáticas. Cada punto recoge el criterio del profesional responsable.
          </p>
        </div>
      </div>

      <StepFooter
        step="recomendaciones"
        disableNext={total === 0}
        onBeforeNext={() => {
          if (total > 0) return true
          window.alert('Escribe al menos una recomendación antes de continuar al informe final.')
          return false
        }}
      />
    </StepCard>
  )
}
