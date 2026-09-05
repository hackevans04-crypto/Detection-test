'use client'

import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { DateField } from '@/components/ui/date-field'
import { SelectField, TextField, TextareaField } from '@/components/ui/fields'
import { StepCard } from '@/features/evaluations/workspace/evaluation-workspace'
import { StepFooter } from '@/features/evaluations/workspace/step-footer'
import { useEvaluation } from '@/features/evaluations/workspace/evaluation-provider'
import type { Referral } from '@/lib/evaluations/model'
import {
  documentCode,
  validateDocumentCode,
  validateLongText,
  validateOptionalDate,
  validateRequiredText,
  type FieldIssue,
} from '@/lib/evaluations/validation'

const sourceOptions = [
  'Unidad de Atencion Ciudadana',
  'UDAI - Unidad de Apoyo a la Inclusion',
  'DECE de la institucion',
  'Docente tutor',
  'Representante legal',
  'Distrito de Educacion',
  'Otra institucion',
] as const

type ReferralIssues = Partial<Record<keyof Referral, FieldIssue>>

export function validateReferral(referral: Referral): ReferralIssues {
  const issues: Partial<Record<keyof Referral, FieldIssue | null>> = {
    reason: validateLongText(referral.reason, 'el motivo de la evaluacion', 20),
    source: validateRequiredText(referral.source, 'Indica quien deriva el caso.'),
    documentNumber: validateDocumentCode(referral.documentNumber, 'numero de oficio'),
    officeNumber: validateDocumentCode(referral.officeNumber, 'oficio o documento'),
    officeDate: validateOptionalDate(referral.officeDate, 'oficio'),
  }

  for (const key of Object.keys(issues) as (keyof Referral)[]) {
    if (!issues[key]) delete issues[key]
  }
  return issues as ReferralIssues
}

function hasReferralBlockingIssues(issues: ReferralIssues) {
  return Object.values(issues).some((found) => found?.severity === 'error')
}

export function ReferralStep() {
  const { evaluation, update } = useEvaluation()
  const [touched, setTouched] = useState(false)
  const issues = useMemo(() => validateReferral(evaluation.referral), [evaluation.referral])
  const issue = (key: keyof Referral) => ({
    error: touched && issues[key]?.severity === 'error' ? issues[key]?.message : undefined,
    warning: touched && issues[key]?.severity === 'warning' ? issues[key]?.message : undefined,
  })

  const setField = <K extends keyof Referral>(key: K, next: Referral[K]) =>
    update((current) => ({ ...current, referral: { ...current.referral, [key]: next } }))

  return (
    <StepCard
      step="motivo"
      description="Por que se inicia la evaluacion y quien la solicita. Encabeza el informe como apartado propio."
    >
      <div className="dt-split-even">
        <fieldset className="dt-fieldset" style={{ marginTop: 0 }}>
          <legend>Motivo de evaluacion</legend>
          <p className="dt-fieldset-hint">Peticion concreta que origina el proceso.</p>
          <TextareaField
            label="Motivo de evaluacion"
            required
            value={evaluation.referral.reason}
            onChange={(next) => setField('reason', next)}
            placeholder="Ej. Solicitar adaptacion curricular y conocer el nivel de madurez y habilidades para el aprendizaje..."
            rows={10}
            {...issue('reason')}
          />
        </fieldset>

        <fieldset className="dt-fieldset" style={{ marginTop: 0 }}>
          <legend>Remitente</legend>
          <p className="dt-fieldset-hint">Institucion que deriva el caso y documento que lo respalda.</p>
          <div className="dt-form-grid">
            <SelectField
              label="Remitente"
              required
              value={evaluation.referral.source}
              onChange={(next) => setField('source', next)}
              options={sourceOptions}
              placeholder="Selecciona la instancia"
              {...issue('source')}
            />
            <TextField
              label="Numero de oficio"
              value={evaluation.referral.documentNumber}
              onChange={(next) => setField('documentNumber', documentCode(next))}
              placeholder="S/N si no consta"
              maxLength={40}
              {...issue('documentNumber')}
            />
            <TextField
              label="Oficio / Documento"
              value={evaluation.referral.officeNumber}
              onChange={(next) => setField('officeNumber', documentCode(next))}
              placeholder="Ej. Oficio N. 025-2026"
              maxLength={40}
              {...issue('officeNumber')}
            />
            <DateField
              label="Fecha del oficio"
              value={evaluation.referral.officeDate}
              onChange={(next) => setField('officeDate', next)}
              maxYear={new Date().getFullYear() + 1}
              {...issue('officeDate')}
            />
            <TextareaField
              label="Texto del oficio o solicitud"
              value={evaluation.referral.requestText}
              onChange={(next) => setField('requestText', next)}
              placeholder="Transcribe aqui la solicitud recibida, si la hay..."
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
          if (!hasReferralBlockingIssues(issues)) return true
          setTouched(true)
          document.querySelector<HTMLElement>('.dt-field-error')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
          return false
        }}
      />
    </StepCard>
  )
}
