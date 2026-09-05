import { completedAreas, functionalAreaSchema } from '@/lib/evaluations/functional-areas'
import { ageAt, formatAge, orDash } from '@/lib/evaluations/format'
import type { Evaluation, StepId } from '@/lib/evaluations/model'

/**
 * Suficiencia de la información del expediente para la evaluación instrumental.
 *
 * No se mide contando campos rellenos. Se mide contra lo que la selección de un
 * instrumento necesita de verdad: sin fecha de nacimiento y fecha de evaluación
 * no hay edad cronológica y ninguna compatibilidad puede comprobarse; sin motivo
 * no hay criterio de pertinencia. Eso es lo que hace insuficiente un expediente.
 *
 * Lo demás -escolaridad, contexto, áreas- afina la pertinencia pero no impide
 * trabajar: falta declarada, no bloqueo.
 */
export type InformationLevel = 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT'

export type MissingInformation = {
  /** Qué falta, dicho en una frase. */
  label: string
  /** Etapa donde se registra, para poder ir a completarlo. */
  step: StepId
  /** `true` cuando su ausencia impide comprobar la aplicabilidad. */
  required: boolean
}

export type InformationCompleteness = {
  level: InformationLevel
  label: string
  missing: MissingInformation[]
}

const informationLabels: Record<InformationLevel, string> = {
  SUFFICIENT: 'Información suficiente',
  PARTIAL: 'Información parcial',
  INSUFFICIENT: 'Información insuficiente',
}

const academicLevelLabels: Record<string, string> = {
  '1': '1.º EGB',
  '2': '2.º EGB',
  '3': '3.º EGB',
  '4': '4.º EGB',
  '5': '5.º EGB',
  '6': '6.º EGB',
  '7': '7.º EGB',
  '8': '8.º EGB',
  '9': '9.º EGB',
  '10': '10.º EGB',
  '11': '1.º Bachillerato',
  '12': '2.º Bachillerato',
  '13': '3.º Bachillerato',
  superior: 'Educación superior',
  universitaria: 'Universitaria',
  bachillerato: 'Bachillerato',
}

export function displayAcademicLevel(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return null

  const normalized = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')

  if (academicLevelLabels[normalized]) return academicLevelLabels[normalized]

  const numeric = /^\d+$/.test(normalized)
  if (numeric) return 'No registrada'

  return trimmed
}

export function evaluateInformationCompleteness(evaluation: Evaluation): InformationCompleteness {
  const filled = (value: string | undefined) => (value ?? '').trim().length > 0
  const { person, evaluationDate } = evaluation.initialData
  const sections = Object.values(evaluation.background).filter((values) =>
    Object.values(values).some((value) => String(value ?? '').trim().length > 0),
  )

  const checks: Array<MissingInformation & { present: boolean }> = [
    {
      present: filled(person.birthDate),
      label: 'Fecha de nacimiento no registrada.',
      step: 'datos-iniciales',
      required: true,
    },
    {
      present: filled(evaluationDate),
      label: 'Fecha de evaluación no registrada.',
      step: 'datos-iniciales',
      required: true,
    },
    {
      present: filled(evaluation.referral.reason),
      label: 'Motivo de evaluación no registrado.',
      step: 'motivo',
      required: true,
    },
    {
      present: filled(person.grade),
      label: 'Escolaridad actual no registrada.',
      step: 'datos-iniciales',
      required: false,
    },
    {
      present: sections.length > 0,
      label: 'Contexto y antecedentes sin registrar.',
      step: 'contexto',
      required: false,
    },
    {
      present: completedAreas(evaluation).length > 0,
      label: 'Ninguna área funcional explorada.',
      step: 'areas',
      required: false,
    },
  ]

  const missing = checks.filter((check) => !check.present).map(({ present: _present, ...rest }) => rest)
  const level: InformationLevel = missing.some((item) => item.required)
    ? 'INSUFFICIENT'
    : missing.length > 0
      ? 'PARTIAL'
      : 'SUFFICIENT'

  return { level, label: informationLabels[level], missing }
}

export type ContextField<T = string> = {
  value: T | null
  source: string
  sourceStep: string
  updatedAt: string
  confidence: number
}

export type EvaluationContextSnapshot = {
  evaluationId: string
  person: {
    fullName: ContextField
    birthDate: ContextField
    chronologicalAge: ContextField
    sex: ContextField
  }
  academic: {
    institution: ContextField
    currentLevel: ContextField
  }
  evaluation: {
    date: ContextField
    professional: ContextField
    reason: ContextField
    referralSource: ContextField
  }
  context: {
    availableSections: ContextField<string[]>
    completedAreas: ContextField<string[]>
    informationSufficiency: ContextField<InformationLevel>
  }
}

function field(value: string | null, source: string, sourceStep: string, updatedAt: string): ContextField {
  const normalized = value?.trim() ? value.trim() : null
  return { value: normalized, source, sourceStep, updatedAt, confidence: normalized ? 1 : 0 }
}

export function buildEvaluationContext(evaluation: Evaluation): EvaluationContextSnapshot {
  const age = ageAt(evaluation.initialData.person.birthDate, evaluation.initialData.evaluationDate)
  const availableSections = Object.entries(evaluation.background)
    .filter(([, values]) => Object.values(values).some((value) => String(value ?? '').trim().length > 0))
    .map(([id]) => id)
  const observedAreas = completedAreas(evaluation).map((area) => area.label)
  const completeness = evaluateInformationCompleteness(evaluation)
  const professionalName = evaluation.report.professional.name.trim() || evaluation.evaluatorName

  return {
    evaluationId: evaluation.id,
    person: {
      fullName: field(evaluation.initialData.person.fullName, 'Datos iniciales', 'datos-iniciales', evaluation.updatedAt),
      birthDate: field(evaluation.initialData.person.birthDate, 'Datos iniciales', 'datos-iniciales', evaluation.updatedAt),
      chronologicalAge: {
        value: age ? formatAge(age) : null,
        source: 'Fecha de nacimiento y fecha de evaluación',
        sourceStep: 'datos-iniciales',
        updatedAt: evaluation.updatedAt,
        confidence: age ? 1 : 0,
      },
      sex: field(evaluation.initialData.person.sex, 'Datos iniciales', 'datos-iniciales', evaluation.updatedAt),
    },
    academic: {
      institution: field(evaluation.initialData.person.institution, 'Datos iniciales', 'datos-iniciales', evaluation.updatedAt),
      currentLevel: field(displayAcademicLevel(evaluation.initialData.person.grade), 'Datos iniciales', 'datos-iniciales', evaluation.updatedAt),
    },
    evaluation: {
      date: field(evaluation.initialData.evaluationDate, 'Datos iniciales', 'datos-iniciales', evaluation.updatedAt),
      professional: field(professionalName, 'Sesión profesional', 'seleccion', evaluation.updatedAt),
      reason: field(evaluation.referral.reason, 'Motivo y remitente', 'motivo', evaluation.updatedAt),
      referralSource: field(evaluation.referral.source, 'Motivo y remitente', 'motivo', evaluation.updatedAt),
    },
    context: {
      availableSections: {
        value: availableSections,
        source: 'Contexto y antecedentes',
        sourceStep: 'contexto',
        updatedAt: evaluation.updatedAt,
        confidence: availableSections.length > 0 ? 1 : 0,
      },
      completedAreas: {
        value: observedAreas,
        source: 'Áreas evaluadas',
        sourceStep: 'areas',
        updatedAt: evaluation.updatedAt,
        confidence: observedAreas.length / functionalAreaSchema.length,
      },
      informationSufficiency: {
        value: completeness.level,
        source: 'Motor de contexto',
        sourceStep: 'instrumentos',
        updatedAt: evaluation.updatedAt,
        confidence: completeness.level === 'SUFFICIENT' ? 1 : completeness.level === 'PARTIAL' ? 0.7 : 0.4,
      },
    },
  }
}

export function compactContextForAI(snapshot: EvaluationContextSnapshot) {
  return {
    evaluationId: snapshot.evaluationId,
    person: {
      age: snapshot.person.chronologicalAge.value,
      sex: snapshot.person.sex.value,
    },
    academic: {
      currentLevel: snapshot.academic.currentLevel.value,
    },
    evaluation: {
      reasonAvailable: Boolean(snapshot.evaluation.reason.value),
      referralSourceAvailable: Boolean(snapshot.evaluation.referralSource.value),
    },
    context: {
      sections: snapshot.context.availableSections.value ?? [],
      areas: snapshot.context.completedAreas.value ?? [],
      sufficiency: snapshot.context.informationSufficiency.value,
    },
  }
}

export function fieldStatus(fieldValue: unknown) {
  if (Array.isArray(fieldValue)) return fieldValue.length > 0 ? `${fieldValue.length} exploradas` : 'Sin registrar'
  return orDash(typeof fieldValue === 'string' ? fieldValue : '')
}

