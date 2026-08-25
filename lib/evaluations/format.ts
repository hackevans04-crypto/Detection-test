/**
 * Formato en español de Ecuador. Todo lo que se muestra al profesional pasa
 * por aquí, para que una fecha se lea igual en el listado, en el workspace y
 * en el informe.
 */

const dateFormatter = new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false })
const longDateFormatter = new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** «Hoy, 09:12» · «Ayer, 16:42» · «24 ago 2026, 10:15». */
export function formatUpdatedAt(iso: string) {
  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) return '—'
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  const time = timeFormatter.format(value)
  if (sameDay(value, now)) return `Hoy, ${time}`
  if (sameDay(value, yesterday)) return `Ayer, ${time}`
  return `${dateFormatter.format(value).replace('.', '')}, ${time}`
}

export function formatDate(iso: string) {
  if (!iso) return '—'
  const value = new Date(`${iso.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(value.getTime())) return '—'
  return dateFormatter.format(value).replace('.', '')
}

export function formatLongDate(iso: string) {
  if (!iso) return '—'
  const value = new Date(`${iso.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(value.getTime())) return '—'
  return longDateFormatter.format(value)
}

export type Age = { years: number; months: number; decimal: number }

/**
 * Edad exacta a la fecha de evaluación. `decimal` es la que comparan los
 * rangos de los instrumentos (el Test ABC habla de 5½ a 6½ años).
 */
export function ageAt(birthDate: string, referenceDate: string): Age | null {
  if (!birthDate || !referenceDate) return null
  const birth = new Date(`${birthDate.slice(0, 10)}T00:00:00`)
  const reference = new Date(`${referenceDate.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(birth.getTime()) || Number.isNaN(reference.getTime())) return null
  if (reference < birth) return null

  let years = reference.getFullYear() - birth.getFullYear()
  let months = reference.getMonth() - birth.getMonth()
  if (reference.getDate() < birth.getDate()) months -= 1
  if (months < 0) {
    years -= 1
    months += 12
  }

  return { years, months, decimal: Math.round((years + months / 12) * 100) / 100 }
}

export function formatAge(age: Age | null) {
  if (!age) return ''
  if (age.years === 0) return `${age.months} ${age.months === 1 ? 'mes' : 'meses'}`
  if (age.months === 0) return `${age.years} ${age.years === 1 ? 'año' : 'años'}`
  return `${age.years} ${age.years === 1 ? 'año' : 'años'} ${age.months} ${age.months === 1 ? 'mes' : 'meses'}`
}

/** Versión corta para tablas y encabezados: «6 años». */
export function formatAgeShort(age: Age | null) {
  if (!age) return 'Edad no registrada'
  return `${age.years} ${age.years === 1 ? 'año' : 'años'}`
}

export function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Fallback explícito: nunca se pinta «undefined» ni una celda vacía. */
export function orDash(value: string | undefined | null, fallback = '—') {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : fallback
}
