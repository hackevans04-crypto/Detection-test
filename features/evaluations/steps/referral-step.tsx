'use client'

import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { DateField } from '@/components/ui/date-field'
import { SelectField, TextField, TextareaField } from '@/components/ui/fields'
import { StepCard } from '@/features/evaluations/workspace/evaluation-workspace'
import { StepFooter } from '@/features/evaluations/workspace/step-footer'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import { missingReferralFields } from '@/lib/evaluations/progress'
import type { Referral } from '@/lib/evaluations/model'

/**
 * Instancias que derivan casos en el sistema educativo ecuatoriano. Es una
 * lista de partida editable, no un catálogo cerrado: siempre se puede escribir
 * otra en el campo de texto que la acompaña.
 */
const sourceOptions = [
  'Unidad de Atención Ciudadana',
  'UDAI · Unidad de Apoyo a la Inclusión',
  'DECE de la institución',
  'Docente tutor',
  'Representante legal',
  'Distrito de Educación',
  'Otra institución',
] as const

export function ReferralStep() {
  const { evaluation, update } = useEvaluation()
  const [touched, setTouched] = useState(false)
  const missing = useMemo(() => missingReferralFields(evaluation), [evaluation])

  const setField = <K extends keyof Referral>(key: K, next: Referral[K]) =>
    update((current) => ({ ...current, referral: { ...current.referral, [key]: next } }))

  return (
    <StepCard
      step="motivo"
      description="Por qué se inicia la evaluación y quién la solicita. Encabeza el informe como apartado propio."
    >
      <div className="dt-split-even">
        <fieldset className="dt-fieldset" style={{ marginTop: 0 }}>
          <legend>Motivo de evaluación</legend>
          <p className="dt-fieldset-hint">Petición concreta que origina el proceso.</p>
          <TextareaField
            label="Motivo de evaluación"
            required
            value={evaluation.referral.reason}
            onChange={(next) => setField('reason', next)}
            placeholder="Ej. Solicitar adaptación curricular y conocer el nivel de madurez y habilidades para el aprendizaje…"
            rows={10}
            error={touched && !evaluation.referral.reason.trim() ? 'Describe el motivo de la evaluación.' : undefined}
          />
        </fieldset>

        <fieldset className="dt-fieldset" style={{ marginTop: 0 }}>
          <legend>Remitente</legend>
          <p className="dt-fieldset-hint">Institución que deriva el caso y documento que lo respalda.</p>
          <div className="dt-form-grid">
            <SelectField
              label="Remitente"
              required
              value={evaluation.referral.source}
              onChange={(next) => setField('source', next)}
              options={sourceOptions}
              placeholder="Selecciona la instancia"
              error={touched && !evaluation.referral.source.trim() ? 'Indica quién deriva el caso.' : undefined}
            />
            <TextField
              label="Número de oficio"
              value={evaluation.referral.documentNumber}
              onChange={(next) => setField('documentNumber', next)}
              placeholder="S/N si no consta"
            />
            <TextField
              label="Oficio / Documento"
              value={evaluation.referral.officeNumber}
              onChange={(next) => setField('officeNumber', next)}
              placeholder="Ej. Oficio N.º 025-2026"
            />
            <DateField
              label="Fecha del oficio"
              value={evaluation.referral.officeDate}
              onChange={(next) => setField('officeDate', next)}
              maxYear={new Date().getFullYear() + 1}
            />
            <TextareaField
              label="Texto del oficio o solicitud"
              value={evaluation.referral.requestText}
              onChange={(next) => setField('requestText', next)}
              placeholder="Transcribe aquí la solicitud recibida, si la hay…"
              rows={6}
              className="dt-span-full"
            />
          </div>
        </fieldset>
      </div>

      <p className="dt-note mt-6">
        <Info aria-hidden="true" />
        El motivo pasa literalmente al apartado 2 del informe. El remitente y el oficio quedan registrados como
        respaldo documental del proceso.
      </p>

      <StepFooter
        step="motivo"
        onBeforeNext={() => {
          if (missing.length === 0) return true
          setTouched(true)
          document.querySelector<HTMLElement>('.dt-field-error')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
          return false
        }}
      />
    </StepCard>
  )
}
