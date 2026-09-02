import { describe, expect, it } from 'vitest'
import {
  isEcuadorianId,
  validateBirthDate,
  validateDisabilityPercent,
  validateEmail,
  validateEvaluationDate,
  validateFullName,
  validateIdentification,
  validatePhone,
  onlyDigits,
  ecuadorPhoneDigits,
  integerPercent,
  nameText,
  documentCode,
} from '@/lib/evaluations/validation'

/**
 * Las reglas se comprueban con vectores calculables a mano, no con datos
 * reales de nadie: el dígito verificador de cada número de ejemplo se puede
 * recalcular con el algoritmo publicado.
 */

describe('cédula ecuatoriana', () => {
  it('acepta números cuyo dígito verificador cuadra', () => {
    // 17-1003406 → suma 25 → verificador (10 − 5) mod 10 = 5.
    expect(isEcuadorianId('1710034065')).toBe(true)
    // 09-2668785 → suma 44 → verificador (10 − 4) mod 10 = 6.
    expect(isEcuadorianId('0926687856')).toBe(true)
  })

  it('rechaza el número con el verificador cambiado', () => {
    expect(isEcuadorianId('1710034060')).toBe(false)
    expect(isEcuadorianId('0926687851')).toBe(false)
  })

  it('rechaza provincias inexistentes', () => {
    expect(isEcuadorianId('2510034065')).toBe(false)
    expect(isEcuadorianId('0010034065')).toBe(false)
  })

  it('rechaza el tercer dígito de persona jurídica', () => {
    expect(isEcuadorianId('1760034065')).toBe(false)
  })

  it('exige diez dígitos', () => {
    expect(isEcuadorianId('171003406')).toBe(false)
    expect(isEcuadorianId('17100340655')).toBe(false)
  })
})

describe('documento de identidad', () => {
  it('deja pasar el campo vacío: no es obligatorio', () => {
    expect(validateIdentification('')).toBeNull()
  })

  it('valida como cédula cuando son diez dígitos', () => {
    expect(validateIdentification('1710034065')).toBeNull()
    expect(validateIdentification('1710034060')?.severity).toBe('error')
  })

  it('rechaza letras y exige diez dígitos', () => {
    expect(validateIdentification('AB1234567')?.severity).toBe('error')
    expect(validateIdentification('171003406')?.message).toContain('10 dígitos')
    expect(validateIdentification('17100340655')?.message).toContain('10 dígitos')
  })

  it('rechaza un documento demasiado corto', () => {
    expect(validateIdentification('123')?.severity).toBe('error')
  })
})

describe('normalizadores de entrada', () => {
  it('limita cédula y campos numéricos a dígitos', () => {
    expect(onlyDigits('17a100-34065', 10)).toBe('1710034065')
    expect(integerPercent('040.5')).toBe('40')
  })

  it('convierte teléfono internacional de Ecuador a nacional', () => {
    expect(ecuadorPhoneDigits('+593 98 765 4321')).toBe('0987654321')
  })

  it('retira caracteres inválidos de nombres y documentos', () => {
    expect(nameText('Ana M4ría!')).toBe('Ana Mría')
    expect(documentCode('Oficio <025>@2026')).toBe('Oficio 0252026')
  })
})

describe('teléfono', () => {
  it('acepta celular de diez dígitos y fijo de nueve', () => {
    expect(validatePhone('0987654321')).toBeNull()
    expect(validatePhone('099 000 0000')).toBeNull()
    expect(validatePhone('052760000')).toBeNull()
  })

  it('acepta el formato internacional del Ecuador', () => {
    expect(validatePhone('+593987654321')).toBeNull()
  })

  it('rechaza longitudes imposibles', () => {
    expect(validatePhone('12345')?.severity).toBe('error')
    expect(validatePhone('45548645645')?.severity).toBe('error')
  })

  it('rechaza un prefijo que no existe', () => {
    expect(validatePhone('0812345678')?.severity).toBe('error')
  })

  it('no exige nada cuando está vacío', () => {
    expect(validatePhone('')).toBeNull()
  })
})

describe('correo electrónico', () => {
  it('exige dominio con extensión', () => {
    expect(validateEmail('ana@example.com')).toBeNull()
    expect(validateEmail('ana@example')?.severity).toBe('error')
    expect(validateEmail('ana example.com')?.severity).toBe('error')
  })
})

describe('nombres', () => {
  it('pide nombre y apellido', () => {
    expect(validateFullName('Torres Aa Fanny')).toBeNull()
    expect(validateFullName('Torres')?.severity).toBe('warning')
  })

  it('rechaza el campo vacío y los números', () => {
    expect(validateFullName('')?.severity).toBe('error')
    expect(validateFullName('Torres 123')?.severity).toBe('error')
  })

  it('admite tildes, eñes, guiones y apóstrofos', () => {
    expect(validateFullName('María Ñañez-O´Brien')).toBeNull()
  })
})

describe('fechas', () => {
  it('rechaza nacer después de la evaluación', () => {
    expect(validateBirthDate('2026-08-01', '2020-02-01')?.severity).toBe('error')
  })

  it('rechaza una fecha de nacimiento futura', () => {
    const future = new Date()
    future.setFullYear(future.getFullYear() + 1)
    expect(validateBirthDate(future.toISOString().slice(0, 10), '')?.severity).toBe('error')
  })

  it('acepta el orden correcto', () => {
    expect(validateBirthDate('2020-02-01', '2026-08-01')).toBeNull()
  })

  it('rechaza una evaluación demasiado lejana', () => {
    const far = new Date()
    far.setFullYear(far.getFullYear() + 3)
    expect(validateEvaluationDate(far.toISOString().slice(0, 10))?.severity).toBe('error')
  })

  it('exige la fecha de evaluación', () => {
    expect(validateEvaluationDate('')?.severity).toBe('error')
  })
})

describe('porcentaje de discapacidad', () => {
  it('no aplica cuando no hay discapacidad', () => {
    expect(validateDisabilityPercent('', false)).toBeNull()
    expect(validateDisabilityPercent('50', false)).toBeNull()
  })

  it('pide el dato cuando sí la hay', () => {
    expect(validateDisabilityPercent('', true)?.severity).toBe('warning')
  })

  it('exige un entero entre 1 y 100', () => {
    expect(validateDisabilityPercent('40', true)).toBeNull()
    expect(validateDisabilityPercent('0', true)?.severity).toBe('error')
    expect(validateDisabilityPercent('120', true)?.severity).toBe('error')
    expect(validateDisabilityPercent('40.5', true)?.severity).toBe('error')
  })
})
