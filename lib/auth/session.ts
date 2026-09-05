import { can, parseRole, type PermissionCode, type RoleCode } from '@/lib/domain/authorization'

export type SessionUser = {
  id: string
  name: string
  email: string
  role: RoleCode
  title: string
  /**
   * Acreditación profesional que firma los informes. Es un dato de normativa
   * institucional -cambia de país a país y de colegio a colegio-, así que se
   * configura, no se supone: si no está, los informes lo declaran ausente en
   * lugar de imprimir un número inventado.
   */
  registrationType: string
  registrationNumber: string
  registrationAuthority: string
}

export type SessionInstitution = {
  id: string
  name: string
  district: string
}

export type AppSession = {
  user: SessionUser
  institution: SessionInstitution
}

/**
 * Sesión del profesional autenticado.
 *
 * Es la única costura entre la aplicación y quién la está usando: ningún
 * componente conoce un nombre, un rol ni una institución que no venga de aquí.
 * Mientras el login no verifique credenciales, el profesional se configura por
 * entorno; cuando exista autenticación real, sólo cambia el cuerpo de esta
 * función.
 */
export async function getSession(): Promise<AppSession> {
  return {
    user: {
      id: process.env.DETECTION_TEST_USER_ID ?? 'profesional-local',
      name: process.env.DETECTION_TEST_USER_NAME ?? 'Profesional',
      email: process.env.DETECTION_TEST_USER_EMAIL ?? '',
      role: parseRole(process.env.DETECTION_TEST_USER_ROLE) ?? 'PSICOPEDAGOGO',
      title: process.env.DETECTION_TEST_USER_TITLE ?? 'Psicopedagogía',
      registrationType: process.env.DETECTION_TEST_USER_REGISTRATION_TYPE ?? '',
      registrationNumber: process.env.DETECTION_TEST_USER_REGISTRATION_NUMBER ?? '',
      registrationAuthority: process.env.DETECTION_TEST_USER_REGISTRATION_AUTHORITY ?? '',
    },
    institution: {
      id: process.env.DETECTION_TEST_INSTITUTION_ID ?? 'institucion-local',
      name: process.env.DETECTION_TEST_INSTITUTION_NAME ?? '',
      district: process.env.DETECTION_TEST_INSTITUTION_DISTRICT ?? '',
    },
  }
}

export async function requirePermission(permission: PermissionCode): Promise<AppSession> {
  const session = await getSession()
  if (!can(session.user.role, permission)) {
    throw new Error(`Permission denied: ${permission}`)
  }
  return session
}
