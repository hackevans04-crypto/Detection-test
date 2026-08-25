'use client'

import { useState } from 'react'
import { Check, CircleDashed, Info } from 'lucide-react'
import { SelectField, TextareaField } from '@/components/ui/fields'
import { StepCard } from '@/features/evaluations/workspace/evaluation-workspace'
import { StepFooter } from '@/features/evaluations/workspace/step-footer'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import {
  areaSchemaById,
  functionalAreaSchema,
  isAreaComplete,
  performanceOptions,
} from '@/lib/evaluations/functional-areas'
import type { FunctionalAreaId, Performance } from '@/lib/evaluations/model'

const performanceTone: Record<Exclude<Performance, ''>, 'success' | 'warning' | 'danger'> = {
  Adecuado: 'success',
  'En desarrollo': 'warning',
  'Dificultad marcada': 'danger',
}

/**
 * Observación psicopedagógica funcional.
 *
 * Es una etapa distinta de los instrumentos: aquí el profesional observa y
 * describe. Ocurre antes de aplicar nada porque es lo que justifica qué
 * instrumentos tiene sentido usar en este caso concreto.
 */
export function FunctionalAreasStep() {
  const { evaluation, update } = useEvaluation()
  const [areaId, setAreaId] = useState<FunctionalAreaId>('conocimiento-corporal')
  const schema = areaSchemaById(areaId)
  const record = evaluation.functionalAreas[areaId]

  const observed = functionalAreaSchema.filter((item) =>
    isAreaComplete(evaluation.functionalAreas[item.id], item),
  ).length

  const patch = (changes: Partial<typeof record>) =>
    update((current) => ({
      ...current,
      functionalAreas: {
        ...current.functionalAreas,
        [areaId]: { ...current.functionalAreas[areaId], ...changes },
      },
    }))

  const setField = (fieldId: string, next: string) =>
    update((current) => ({
      ...current,
      functionalAreas: {
        ...current.functionalAreas,
        [areaId]: {
          ...current.functionalAreas[areaId],
          fields: { ...current.functionalAreas[areaId].fields, [fieldId]: next },
        },
      },
    }))

  return (
    <StepCard
      step="areas"
      description="Observación funcional del estudiante. Describe lo observado y valora el desempeño de cada área."
      aside={
        <span className="dt-badge" data-tone={observed === functionalAreaSchema.length ? 'success' : 'neutral'}>
          {observed} de {functionalAreaSchema.length} áreas observadas
        </span>
      }
    >
      <div className="dt-substep">
        <nav className="dt-substep-nav" aria-label="Áreas evaluadas">
          {functionalAreaSchema.map((item) => {
            const complete = isAreaComplete(evaluation.functionalAreas[item.id], item)
            return (
              <button
                key={item.id}
                type="button"
                className="dt-substep-item"
                aria-current={item.id === areaId ? 'true' : undefined}
                onClick={() => setAreaId(item.id)}
              >
                <span className="dt-substep-mark" data-complete={complete} aria-hidden="true">
                  {complete ? <Check /> : <CircleDashed />}
                </span>
                {item.label}
                <span className="dt-sr-only">{complete ? '(observada)' : '(pendiente)'}</span>
              </button>
            )
          })}
        </nav>

        <div className="dt-substep-body">
          <header className="dt-substep-head">
            <h3>{schema.label}</h3>
            <p>{schema.purpose}</p>
          </header>

          {schema.fields.length > 0 ? (
            <div className="dt-form-grid" data-columns="4">
              {schema.fields.map((field) => (
                <SelectField
                  key={field.id}
                  label={field.label}
                  required
                  value={record.fields[field.id] ?? ''}
                  onChange={(next) => setField(field.id, next)}
                  options={field.options}
                  placeholder="Selecciona"
                />
              ))}
            </div>
          ) : null}

          <div className="mt-5">
            <TextareaField
              label={schema.descriptionLabel}
              required
              value={record.description}
              onChange={(next) => patch({ description: next })}
              placeholder={schema.descriptionPlaceholder}
              rows={4}
            />
          </div>

          <fieldset className="dt-fieldset">
            <legend className="dt-label" style={{ marginBottom: 10 }}>
              Desempeño <em aria-hidden="true">*</em>
            </legend>
            <div className="dt-choice-row" role="radiogroup" aria-label={`Desempeño en ${schema.label}`}>
              {performanceOptions.map((option) => (
                <label
                  key={option}
                  className="dt-radio-pill"
                  data-checked={record.performance === option}
                  data-tone={performanceTone[option]}
                >
                  <input
                    type="radio"
                    name={`performance-${areaId}`}
                    value={option}
                    checked={record.performance === option}
                    onChange={() => patch({ performance: option })}
                  />
                  <span className="dt-radio-dot" aria-hidden="true" />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-5">
            <TextareaField
              label="Observaciones"
              value={record.observations}
              onChange={(next) => patch({ observations: next })}
              placeholder="Apoyos requeridos, estrategias que funcionaron, actitud durante la observación…"
              rows={3}
            />
          </div>
        </div>
      </div>

      <p className="dt-note mt-6">
        <Info aria-hidden="true" />
        Las áreas marcadas con <strong>dificultad marcada</strong> se recogen automáticamente en el resumen de
        evidencia de las conclusiones.
      </p>

      <StepFooter step="areas" />
    </StepCard>
  )
}
