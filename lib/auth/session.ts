import { can, type PermissionCode, type RoleCode } from '@/lib/domain/authorization'

export type SessionUser = {
  id: string
  name: string
  email: string
  role: RoleCode
  title: string
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
      role: (process.env.DETECTION_TEST_USER_ROLE as RoleCode | undefined) ?? 'PSICOPEDAGOGO',
      title: process.env.DETECTION_TEST_USER_TITLE ?? 'Psicopedagogía',
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
