import type { Instrument } from '@/instruments/types'
import { ageAt, formatAge } from '@/lib/evaluations/format'
import type { Evaluation } from '@/lib/evaluations/model'

export type EligibilityStatus = 'COMPATIBLE' | 'COMPATIBLE_WITH_WARNING' | 'NOT_RECOMMENDED' | 'NOT_APPLICABLE' | 'UNKNOWN'

export type EligibilityResult = {
  status: EligibilityStatus
  label: string
  message: string
  ageLabel: string
}

export function evaluateInstrumentEligibility(evaluation: Evaluation, instrument: Instrument): EligibilityResult {
  const age = ageAt(evaluation.initialData.person.birthDate, evaluation.initialData.evaluationDate)
  if (!age) {
    return {
      status: 'UNKNOWN',
      label: 'Edad no registrada',
      message: 'El instrumento requiere fecha de nacimiento y fecha de evaluación para validar aplicabilidad.',
      ageLabel: 'Sin edad',
    }
  }

  const upperBound = Number.isInteger(instrument.edadMax) ? instrument.edadMax + 0.99 : instrument.edadMax
  const compatible = age.decimal >= instrument.edadMin && age.decimal <= upperBound

  if (compatible) {
    return {
      status: 'COMPATIBLE',
      label: 'Compatible',
      message: `Edad cronológica ${formatAge(age)} dentro del rango definido (${instrument.rangoTexto}).`,
      ageLabel: formatAge(age),
    }
  }

  return {
    status: 'NOT_APPLICABLE',
    label: 'No aplicable',
    message: `El rango de edad definido para este instrumento (${instrument.rangoTexto}) no corresponde con la edad cronológica registrada (${formatAge(age)}).`,
    ageLabel: formatAge(age),
  }
}

export type AgeCheck = {
  applicable: boolean
  ageLabel: string
  rangeLabel: string
  message: string
}

/** Lectura de la compatibilidad de edad para la ficha del instrumento. */
export function ageCheckFor(evaluation: Evaluation, instrument: Instrument): AgeCheck | null {
  const result = evaluateInstrumentEligibility(evaluation, instrument)
  if (result.status === 'UNKNOWN') return null
  return {
    applicable: result.status === 'COMPATIBLE' || result.status === 'COMPATIBLE_WITH_WARNING',
    ageLabel: result.ageLabel,
    rangeLabel: instrument.rangoTexto,
    message: result.message,
  }
}
