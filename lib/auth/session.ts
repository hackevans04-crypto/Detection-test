import { can, type PermissionCode, type RoleCode } from '@/lib/domain/authorization'

export type AppSession = {
  user: {
    id: string
    name: string
    email: string
    role: RoleCode
    title: string
  }
  institution: {
    id: string
    name: string
    district: string
  }
}

export const currentSession: AppSession = {
  user: {
    id: 'usr_maria_fernandez',
    name: 'Maria Fernandez',
    email: 'maria.fernandez@detection.test',
    role: 'PSICOPEDAGOGO',
    title: 'Psicopedagoga',
  },
  institution: {
    id: 'inst_udai_15d02',
    name: 'UDAI - 15D02 El Chaco - Quijos',
    district: '15D02',
  },
}

export function requirePermission(permission: PermissionCode) {
  if (!can(currentSession.user.role, permission)) {
    throw new Error(`Permission denied: ${permission}`)
  }

  return currentSession
}
