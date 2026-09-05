import type { SessionUser } from '@/lib/auth/session'
import type { ProfessionalSnapshot } from '@/lib/evaluations/model'

/**
 * Identidad profesional que firma.
 *
 * El registro profesional -colegiatura, matrícula, número de acreditación,
 * según la normativa de cada institución- no se escribe en el código ni se
 * rellena con un ejemplo. Viene del perfil autenticado, y cuando no está
 * configurado el informe lo dice.
 *
 * Al aprobar un informe, la identidad se congela: si mañana el profesional
 * cambia de título o le renuevan el número, el informe ya firmado conserva las
 * credenciales con las que se firmó. Un informe reescribe su historia sólo si
 * guarda una referencia viva en lugar de una copia.
 */

export const REGISTRATION_MISSING = 'Registro profesional no configurado.'

export function hasRegistration(user: Pick<SessionUser, 'registrationNumber'>) {
  return user.registrationNumber.trim().length > 0
}

/** Snapshot para firmar. Se guarda con el informe, no se recalcula al leerlo. */
export function professionalSnapshot(user: SessionUser): ProfessionalSnapshot {
  return {
    professionalId: user.id,
    name: user.name.trim(),
    title: user.title.trim(),
    registrationType: user.registrationType.trim(),
    registrationNumber: user.registrationNumber.trim(),
    registrationAuthority: user.registrationAuthority.trim(),
  }
}

/** `Registro profesional: 12345` · o la ausencia declarada. */
export function registrationLine(snapshot: Pick<ProfessionalSnapshot, 'registrationType' | 'registrationNumber' | 'registrationAuthority'>) {
  const number = snapshot.registrationNumber.trim()
  if (!number) return REGISTRATION_MISSING

  const label = snapshot.registrationType.trim() || 'Registro profesional'
  const authority = snapshot.registrationAuthority.trim()
  return authority ? `${label}: ${number} · ${authority}` : `${label}: ${number}`
}

export type ProfessionalIdentity = {
  name: string
  title: string
  registration: string
  registered: boolean
}

export function professionalIdentity(snapshot: ProfessionalSnapshot): ProfessionalIdentity {
  return {
    name: snapshot.name || 'Profesional sin nombre configurado',
    title: snapshot.title,
    registration: registrationLine(snapshot),
    registered: snapshot.registrationNumber.trim().length > 0,
  }
}
