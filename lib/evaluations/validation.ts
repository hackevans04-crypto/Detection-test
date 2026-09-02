import { ageAt } from '@/lib/evaluations/format'

/**
 * Reglas de validación del expediente.
 *
 * Están aquí, fuera de los componentes, porque el mismo dato se valida al
 * crear la evaluación y al corregirla después: una sola definición de qué es
 * un teléfono válido evita que las dos pantallas discrepen.
 *
 * El criterio es distinguir, no bloquear por bloquear: un documento que no es
 * una cédula ecuatoriana puede ser un pasaporte perfectamente legítimo, y el
 * sistema lo acepta como tal en vez de rechazarlo.
 */

export type FieldIssue = { message: string; severity: 'error' | 'warning' }

/* Se admiten los tres apóstrofos que salen de un teclado español: el recto, el
   tipográfico y el acento agudo suelto, que es el que produce la tecla muerta. */
const NAME_PATTERN = /^[\p{L}\p{M}'’´· .-]+$/u

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/

/** Provincias del Ecuador: 01 a 24, más 30 para el registro consular. */
const MIN_PROVINCE = 1
const MAX_PROVINCE = 24
const CONSULAR_PROVINCE = 30

export function digitsOf(value: string) {
  return value.replace(/\D/g, '')
}

export function onlyDigits(value: string, maxLength?: number) {
  const digits = digitsOf(value)
  return typeof maxLength === 'number' ? digits.slice(0, maxLength) : digits
}

export function ecuadorPhoneDigits(value: string) {
  const digits = digitsOf(value)
  const national = digits.startsWith('593') ? `0${digits.slice(3)}` : digits
  return national.slice(0, 10)
}

export function integerPercent(value: string) {
  return onlyDigits(value, 3).replace(/^0+(?=\d)/, '')
}

export function nameText(value: string) {
  return value.replace(/[^\p{L}\p{M}'’´· .-]/gu, '').replace(/\s{2,}/g, ' ')
}

export function documentCode(value: string) {
  return value.replace(/[^\p{L}\p{N}/ .°º#-]/gu, '').slice(0, 40)
}

/**
 * Cédula ecuatoriana: módulo 10 sobre los nueve primeros dígitos.
 *
 * Los coeficientes alternan 2 y 1; cuando el producto pasa de 9 se le restan 9,
 * y el décimo dígito es el complemento a diez de la suma.
 */
export function isEcuadorianId(value: string) {
  const digits = digitsOf(value)
  if (digits.length !== 10) return false

  const province = Number(digits.slice(0, 2))
  if ((province < MIN_PROVINCE || province > MAX_PROVINCE) && province !== CONSULAR_PROVINCE) return false
  // El tercer dígito menor que 6 identifica a una persona natural.
  if (Number(digits[2]) > 5) return false

  let sum = 0
  for (let index = 0; index < 9; index += 1) {
    const coefficient = index % 2 === 0 ? 2 : 1
    const product = Number(digits[index]) * coefficient
    sum += product > 9 ? product - 9 : product
  }

  return (10 - (sum % 10)) % 10 === Number(digits[9])
}

/**
 * Documento de identidad del evaluado: cédula ecuatoriana obligatoria cuando
 * se registra este campo. Debe tener diez dígitos y superar el verificador.
 */
export function validateIdentification(value: string): FieldIssue | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const digits = digitsOf(trimmed)
  if (digits !== trimmed) {
    return { message: 'La cédula sólo debe contener números.', severity: 'error' }
  }
  if (digits.length !== 10) return { message: 'La cédula debe tener exactamente 10 dígitos.', severity: 'error' }
  return isEcuadorianId(trimmed)
    ? null
    : { message: 'La cédula no supera el dígito verificador. Revisa los números.', severity: 'error' }
}

/**
 * Teléfono del Ecuador: móvil de diez dígitos que empieza por 09, o fijo de
 * nueve que empieza por 0 y una provincia del 2 al 7.
 */
export function validatePhone(value: string, label = 'teléfono'): FieldIssue | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const digits = digitsOf(trimmed)
  if (digits.startsWith('593')) {
    // Formato internacional: se normaliza a nacional para comprobarlo.
    return validatePhone(`0${digits.slice(3)}`, label)
  }

  if (/^09\d{8}$/.test(digits)) return null
  if (/^0[2-7]\d{7}$/.test(digits)) return null

  if (digits.length < 9 || digits.length > 10) {
    return { message: `El ${label} debe tener 9 dígitos (fijo) o 10 (celular).`, severity: 'error' }
  }

  return { message: `Revisa el ${label}: un celular empieza por 09 y un fijo por 0 más la provincia.`, severity: 'error' }
}

export function validateEmail(value: string, label = 'correo electrónico'): FieldIssue | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  return EMAIL_PATTERN.test(trimmed) ? null : { message: `Revisa el ${label}.`, severity: 'error' }
}

export function validateFullName(value: string): FieldIssue | null {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed) return { message: 'Escribe los nombres y apellidos del evaluado.', severity: 'error' }
  if (trimmed.length < 5) return { message: 'El nombre parece incompleto.', severity: 'error' }
  if (!NAME_PATTERN.test(trimmed)) {
    return { message: 'El nombre sólo debe contener letras, espacios, guiones o apóstrofos.', severity: 'error' }
  }
  if (!trimmed.includes(' ')) {
    return { message: 'Incluye al menos un nombre y un apellido.', severity: 'warning' }
  }
  return null
}

export function validatePersonName(value: string, label: string): FieldIssue | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!NAME_PATTERN.test(trimmed)) {
    return { message: `El nombre ${label} sólo debe contener letras.`, severity: 'error' }
  }
  return null
}

const MAX_HUMAN_AGE = 120

/** Fecha de nacimiento contra la de evaluación: orden, futuro y plausibilidad. */
export function validateBirthDate(birthDate: string, evaluationDate: string): FieldIssue | null {
  if (!birthDate) return { message: 'Selecciona la fecha de nacimiento.', severity: 'error' }

  const birth = new Date(`${birthDate.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return { message: 'La fecha de nacimiento no es válida.', severity: 'error' }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (birth > today) return { message: 'La fecha de nacimiento no puede estar en el futuro.', severity: 'error' }

  if (evaluationDate) {
    const age = ageAt(birthDate, evaluationDate)
    if (!age) {
      return { message: 'La fecha de nacimiento no puede ser posterior a la de evaluación.', severity: 'error' }
    }
    if (age.years > MAX_HUMAN_AGE) {
      return { message: 'Revisa la fecha de nacimiento: la edad resultante no es plausible.', severity: 'error' }
    }
  }

  return null
}

const MAX_FUTURE_DAYS = 365

export function validateEvaluationDate(value: string): FieldIssue | null {
  if (!value) return { message: 'Selecciona la fecha de evaluación.', severity: 'error' }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return { message: 'La fecha de evaluación no es válida.', severity: 'error' }

  const limit = new Date()
  limit.setHours(0, 0, 0, 0)
  limit.setDate(limit.getDate() + MAX_FUTURE_DAYS)
  if (date > limit) {
    return { message: 'La fecha de evaluación está demasiado lejos en el futuro.', severity: 'error' }
  }

  return null
}

/** El porcentaje sólo existe cuando hay discapacidad, y va de 1 a 100. */
export function validateDisabilityPercent(value: string, hasDisability: boolean): FieldIssue | null {
  const trimmed = value.trim()
  if (!hasDisability) return null
  if (!trimmed) return { message: 'Indica el porcentaje que consta en el carné.', severity: 'warning' }

  const percent = Number(trimmed)
  if (!Number.isFinite(percent) || !Number.isInteger(percent)) {
    return { message: 'El porcentaje debe ser un número entero.', severity: 'error' }
  }
  if (percent < 1 || percent > 100) {
    return { message: 'El porcentaje debe estar entre 1 y 100.', severity: 'error' }
  }
  return null
}

export function validateRequiredText(value: string, message: string): FieldIssue | null {
  return value.trim() ? null : { message, severity: 'error' }
}
