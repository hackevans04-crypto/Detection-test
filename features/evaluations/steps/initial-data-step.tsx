'use client'

import { useMemo, useState } from 'react'
import { StepCard } from '@/features/evaluations/workspace/evaluation-workspace'
import { StepFooter } from '@/features/evaluations/workspace/step-footer'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { hasBlockingIssues, InitialDataForm, validateInitialData } from '@/features/evaluations/steps/initial-data-form'

export function InitialDataStep() {
  const { evaluation, update } = useEvaluation()
  const [touched, setTouched] = useState(false)

  const errors = useMemo(() => validateInitialData(evaluation.initialData), [evaluation.initialData])

  return (
    <>
      <StepCard
        step="datos-iniciales"
        description="Corrige o completa la ficha del evaluado. Los cambios se reflejan en el informe final."
      >
        <InitialDataForm
          value={evaluation.initialData}
          onChange={(initialData) =>
            update((current) => {
              // La ubicación escolar del paso 2 sigue a la del paso 1 mientras
              // el profesional no la haya corregido allí a mano.
              const escolar = { ...current.background['contexto-educativo'] }
              if (!escolar.institucion || escolar.institucion === current.initialData.person.institution) {
                escolar.institucion = initialData.person.institution
              }
              if (!escolar.grado || escolar.grado === current.initialData.person.grade) {
                escolar.grado = initialData.person.grade
              }
              return { ...current, initialData, background: { ...current.background, 'contexto-educativo': escolar } }
            })
          }
          errors={touched ? errors : undefined}
        />

        <StepFooter
          step="datos-iniciales"
          disableNext={false}
          onBeforeNext={() => {
            if (!hasBlockingIssues(errors)) return true
            setTouched(true)
            document.querySelector<HTMLElement>('.dt-field-error')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
            return false
          }}
        />
      </StepCard>
    </>
  )
}
