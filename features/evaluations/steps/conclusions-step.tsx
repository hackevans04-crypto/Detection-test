'use client'

import { Info, Lightbulb } from 'lucide-react'
import { EntryList } from '@/features/evaluations/components/entry-list'
import { StepCard } from '@/features/evaluations/workspace/evaluation-workspace'
import { StepFooter } from '@/features/evaluations/workspace/step-footer'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { evaluationEvidence } from '@/lib/evaluations/evidence'

/**
 * Conclusiones.
 *
 * A la izquierda, la evidencia acumulada en todo el proceso; a la derecha, las
 * conclusiones del profesional, una a una. El resumen es material de consulta,
 * nunca un borrador autogenerado: el sistema reúne pruebas, la conclusión la
 * firma una persona.
 */
export function ConclusionsStep() {
  const { evaluation, update } = useEvaluation()
  const evidence = evaluationEvidence(evaluation)
  const written = evaluation.conclusions.filter((entry) => entry.text.trim()).length

  return (
    <StepCard
      step="conclusiones"
      description="Sintetiza los hallazgos del proceso apoyándote en la evidencia registrada. Cada conclusión se guarda por separado y llega numerada al informe."
      aside={
        <span className="dt-badge" data-tone={written > 0 ? 'primary' : 'neutral'}>
          {written} {written === 1 ? 'conclusión' : 'conclusiones'}
        </span>
      }
    >
      <div className="dt-split">
        <aside className="dt-block">
          <h3 className="text-sm font-bold" style={{ color: 'var(--dt-text)' }}>
            Resumen de evidencia
          </h3>
          <p className="mt-1 text-xs" style={{ color: 'var(--dt-muted)' }}>
            Lo que ya está registrado en el expediente, para consulta mientras redactas.
          </p>

          <div className="mt-4 grid gap-4">
            {evidence.map((group) => (
              <section key={group.id}>
                <h4
                  className="text-[10px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: 'var(--dt-faint)' }}
                >
                  {group.title}
                </h4>
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
              </section>
            ))}
          </div>

          <p className="dt-note mt-5">
            <Info aria-hidden="true" />
            Los datos calculados apoyan la conclusión, pero no la sustituyen ni constituyen un diagnóstico clínico.
          </p>
        </aside>

        <div>
          <h3 className="dt-section-title">
            <Lightbulb aria-hidden="true" />
            Conclusiones profesionales
          </h3>
          <p className="mt-1 text-sm" style={{ color: 'var(--dt-muted)' }}>
            Añade una conclusión por hallazgo. Podrás reordenarlas, editarlas o eliminarlas antes de emitir el informe.
          </p>

          <div className="mt-4">
            <EntryList
              entries={evaluation.conclusions}
              onChange={(next) => update((current) => ({ ...current, conclusions: next }))}
              addLabel="Añadir conclusión"
              placeholder="Hallazgo concreto, con la evidencia que lo respalda…"
              emptyText="Todavía no hay conclusiones. Añade la primera cuando tengas clara la síntesis del proceso."
            />
          </div>
        </div>
      </div>

      <StepFooter
        step="conclusiones"
        disableNext={written === 0}
        onBeforeNext={() => {
          if (written > 0) return true
          window.alert('Añade al menos una conclusión antes de continuar a recomendaciones.')
          return false
        }}
      />
    </StepCard>
  )
}
