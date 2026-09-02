'use client'

import { DateField } from '@/components/ui/date-field'
import { DerivedField, SelectField, TextField } from '@/components/ui/fields'
import { ageAt, formatAge } from '@/lib/evaluations/format'
import type { InitialData, Sex } from '@/lib/evaluations/model'
import {
  validateBirthDate,
  validateDisabilityPercent,
  validateEmail,
  validateEvaluationDate,
  validateFullName,
  validateIdentification,
  validatePersonName,
  validatePhone,
  validateRequiredText,
  ecuadorPhoneDigits,
  integerPercent,
  nameText,
  onlyDigits,
  type FieldIssue,
} from '@/lib/evaluations/validation'

const sexOptions: readonly Sex[] = ['Masculino', 'Femenino', 'Prefiere no decirlo']

const disabilityOptions = [
  'Ninguna',
  'Intelectual',
  'Física',
  'Visual',
  'Auditiva',
  'Psicosocial',
  'Múltiple',
  'En proceso de valoración',
] as const

const relationshipOptions = ['Madre', 'Padre', 'Abuelo/a', 'Tío/a', 'Hermano/a', 'Tutor/a legal', 'Otro'] as const

export type InitialDataIssues = Record<string, FieldIssue | null | undefined>

/** Nombre anterior, conservado para no romper a quien lo importe. */
export type InitialDataErrors = InitialDataIssues

/**
 * Datos de identificación del evaluado.
 *
 * Reproduce el encabezado del informe: datos personales, información académica
 * y familia o representante. El motivo y el remitente no están aquí — tienen
 * etapa propia, porque en el informe explican por qué existe la evaluación.
 */
export function InitialDataForm({
  value,
  onChange,
  errors,
}: {
  value: InitialData
  onChange: (next: InitialData) => void
  errors?: InitialDataIssues
}) {
  const issue = (key: string) => {
    const found = errors?.[key]
    return {
      error: found?.severity === 'error' ? found.message : undefined,
      warning: found?.severity === 'warning' ? found.message : undefined,
    }
  }
  const age = ageAt(value.person.birthDate, value.evaluationDate)

  const setPerson = <K extends keyof InitialData['person']>(key: K, next: InitialData['person'][K]) =>
    onChange({ ...value, person: { ...value.person, [key]: next } })

  const setFamily = <K extends keyof InitialData['family']>(key: K, next: InitialData['family'][K]) =>
    onChange({ ...value, family: { ...value.family, [key]: next } })

  const hasDisability = value.person.disability !== '' && value.person.disability !== 'Ninguna'

  return (
    <>
      <fieldset className="dt-fieldset">
        <legend>Datos personales</legend>
        <p className="dt-fieldset-hint">Identificación del estudiante evaluado.</p>
        <div className="dt-form-grid" data-columns="3">
          <TextField
            label="Nombres y apellidos"
            required
            value={value.person.fullName}
            onChange={(next) => setPerson('fullName', nameText(next))}
            placeholder="Nombre completo del evaluado"
            autoComplete="off"
            {...issue('fullName')}
          />
          <DateField
            label="Fecha de nacimiento"
            required
            value={value.person.birthDate}
            onChange={(next) => setPerson('birthDate', next)}
            {...issue('birthDate')}
          />
          <DateField
            label="Fecha de evaluación"
            required
            value={value.evaluationDate}
            onChange={(next) => onChange({ ...value, evaluationDate: next })}
            {...issue('evaluationDate')}
          />
          <DerivedField
            label="Edad"
            value={age ? formatAge(age) : ''}
            hint="Calculada a la fecha de evaluación."
          />
          <TextField
            label="Cédula / Identificación"
            value={value.person.identification}
            onChange={(next) => setPerson('identification', onlyDigits(next, 10))}
            placeholder="0123456789"
            inputMode="numeric"
            maxLength={10}
            pattern="\d{10}"
            {...issue('identification')}
          />
          <SelectField
            label="Sexo"
            value={value.person.sex}
            onChange={(next) => setPerson('sex', next as Sex)}
            options={sexOptions}
            placeholder="Sin especificar"
          />
          <SelectField
            label="Discapacidad"
            value={value.person.disability}
            onChange={(next) =>
              onChange({
                ...value,
                person: {
                  ...value.person,
                  disability: next,
                  // El porcentaje sólo tiene sentido si hay discapacidad.
                  disabilityPercent: next === 'Ninguna' || next === '' ? '' : value.person.disabilityPercent,
                },
              })
            }
            options={disabilityOptions}
            placeholder="Selecciona"
          />
          {hasDisability ? (
            <TextField
              label="Porcentaje (%)"
              value={value.person.disabilityPercent}
              onChange={(next) => setPerson('disabilityPercent', integerPercent(next))}
              placeholder="Según carné de discapacidad"
              inputMode="numeric"
              maxLength={3}
              pattern="\d{1,3}"
              hint="Sólo si consta en el carné."
              {...issue('disabilityPercent')}
            />
          ) : null}
        </div>
      </fieldset>

      <fieldset className="dt-fieldset">
        <legend>Información académica</legend>
        <p className="dt-fieldset-hint">Ubicación escolar en el momento de la evaluación.</p>
        <div className="dt-form-grid" data-columns="3">
          <TextField
            label="Institución educativa"
            required
            value={value.person.institution}
            onChange={(next) => setPerson('institution', next)}
            placeholder="Nombre de la institución"
            {...issue('institution')}
          />
          <TextField
            label="Grado / Curso"
            required
            value={value.person.grade}
            onChange={(next) => setPerson('grade', next)}
            placeholder="Ej. 2do EGB"
            {...issue('grade')}
          />
          <TextField
            label="Docente tutor"
            value={value.person.tutor}
            onChange={(next) => setPerson('tutor', nameText(next))}
            placeholder="Nombre del docente"
            {...issue('tutor')}
          />
        </div>
      </fieldset>

      <fieldset className="dt-fieldset">
        <legend>Contacto y domicilio</legend>
        <p className="dt-fieldset-hint">Datos de localización del estudiante.</p>
        <div className="dt-form-grid" data-columns="3">
          <TextField
            label="Domicilio"
            value={value.person.address}
            onChange={(next) => setPerson('address', next)}
            placeholder="Dirección de residencia"
          />
          <TextField
            label="Teléfono"
            type="tel"
            value={value.person.phone}
            onChange={(next) => setPerson('phone', ecuadorPhoneDigits(next))}
            placeholder="099 000 0000"
            inputMode="tel"
            maxLength={10}
            pattern="0(9\d{8}|[2-7]\d{7})"
            {...issue('phone')}
          />
          <TextField
            label="Correo electrónico"
            type="email"
            value={value.person.email}
            onChange={(next) => setPerson('email', next)}
            placeholder="correo@ejemplo.com"
            {...issue('email')}
          />
        </div>
      </fieldset>

      <fieldset className="dt-fieldset">
        <legend>Familia y representante legal</legend>
        <p className="dt-fieldset-hint">Con quién se coordina el proceso.</p>
        <div className="dt-form-grid" data-columns="3">
          <TextField
            label="Nombre de la madre"
            value={value.family.motherName}
            onChange={(next) => setFamily('motherName', nameText(next))}
            placeholder="Nombre completo"
            {...issue('motherName')}
          />
          <TextField
            label="Nombre del padre"
            value={value.family.fatherName}
            onChange={(next) => setFamily('fatherName', nameText(next))}
            placeholder="Nombre completo"
            {...issue('fatherName')}
          />
          <TextField
            label="Representante legal"
            value={value.family.guardianName}
            onChange={(next) => setFamily('guardianName', nameText(next))}
            placeholder="Nombre completo"
            {...issue('guardianName')}
          />
          <SelectField
            label="Parentesco"
            value={value.family.guardianRelationship}
            onChange={(next) => setFamily('guardianRelationship', next)}
            options={relationshipOptions}
            placeholder="Selecciona"
          />
          <TextField
            label="Teléfono del representante"
            type="tel"
            value={value.family.guardianPhone}
            onChange={(next) => setFamily('guardianPhone', ecuadorPhoneDigits(next))}
            placeholder="099 000 0000"
            inputMode="tel"
            maxLength={10}
            pattern="0(9\d{8}|[2-7]\d{7})"
            {...issue('guardianPhone')}
          />
          <TextField
            label="Correo del representante"
            type="email"
            value={value.family.guardianEmail}
            onChange={(next) => setFamily('guardianEmail', next)}
            placeholder="correo@ejemplo.com"
            {...issue('guardianEmail')}
          />
        </div>
      </fieldset>
    </>
  )
}

/**
 * Validacion del paso 1.
 *
 * Devuelve un aviso por campo. Solo los de severidad error impiden avanzar: un
 * documento que no es cedula ecuatoriana se admite como pasaporte, y decirlo es
 * mas util que rechazarlo.
 */
export function validateInitialData(value: InitialData): InitialDataIssues {
  const { person, family, evaluationDate } = value
  const hasDisability = person.disability !== '' && person.disability !== 'Ninguna'

  const issues: InitialDataIssues = {
    fullName: validateFullName(person.fullName),
    birthDate: validateBirthDate(person.birthDate, evaluationDate),
    evaluationDate: validateEvaluationDate(evaluationDate),
    identification: validateIdentification(person.identification),
    disabilityPercent: validateDisabilityPercent(person.disabilityPercent, hasDisability),
    institution: validateRequiredText(person.institution, 'Indica la institucion educativa.'),
    grade: validateRequiredText(person.grade, 'Indica el grado o curso.'),
    tutor: validatePersonName(person.tutor, 'del docente tutor'),
    phone: validatePhone(person.phone),
    email: validateEmail(person.email),
    motherName: validatePersonName(family.motherName, 'de la madre'),
    fatherName: validatePersonName(family.fatherName, 'del padre'),
    guardianName: validatePersonName(family.guardianName, 'del representante'),
    guardianPhone: validatePhone(family.guardianPhone, 'telefono del representante'),
    guardianEmail: validateEmail(family.guardianEmail, 'correo del representante'),
  }

  for (const key of Object.keys(issues)) {
    if (!issues[key]) delete issues[key]
  }
  return issues
}

/** Solo los errores bloquean; los avisos acompanan. */
export function hasBlockingIssues(issues: InitialDataIssues) {
  return Object.values(issues).some((found) => found?.severity === 'error')
}
