export const roles = [
  'SUPER_ADMIN',
  'ADMIN_INSTITUCION',
  'PSICOPEDAGOGO',
  'DECE',
  'DOCENTE_APOYO',
  'DOCENTE',
  'CONSULTA',
] as const

export type RoleCode = (typeof roles)[number]

export const permissions = [
  'dashboard.read',
  'students.read',
  'students.create',
  'students.update',
  'records.read.basic',
  'records.read.family',
  'records.read.health',
  'evaluations.read',
  'evaluations.create',
  'evaluations.update',
  'instruments.read',
  'reports.read',
  'reports.create',
  'reports.finalize',
  'ai_analyses.create',
  'curricular_adaptations.manage',
  'followups.manage',
  'appointments.manage',
  'users.manage',
  'roles.manage',
  'audit_logs.read',
] as const

export type PermissionCode = (typeof permissions)[number]

export const rolePermissions: Record<RoleCode, PermissionCode[]> = {
  SUPER_ADMIN: [...permissions],
  ADMIN_INSTITUCION: [
    'dashboard.read',
    'students.read',
    'students.create',
    'students.update',
    'records.read.basic',
    'records.read.family',
    'records.read.health',
    'evaluations.read',
    'evaluations.create',
    'evaluations.update',
    'instruments.read',
    'reports.read',
    'reports.create',
    'reports.finalize',
    'ai_analyses.create',
    'curricular_adaptations.manage',
    'followups.manage',
    'appointments.manage',
    'users.manage',
    'roles.manage',
    'audit_logs.read',
  ],
  PSICOPEDAGOGO: [
    'dashboard.read',
    'students.read',
    'students.create',
    'students.update',
    'records.read.basic',
    'records.read.family',
    'records.read.health',
    'evaluations.read',
    'evaluations.create',
    'evaluations.update',
    'instruments.read',
    'reports.read',
    'reports.create',
    'reports.finalize',
    'ai_analyses.create',
    'curricular_adaptations.manage',
    'followups.manage',
    'appointments.manage',
  ],
  DECE: [
    'dashboard.read',
    'students.read',
    'records.read.basic',
    'records.read.family',
    'evaluations.read',
    'reports.read',
    'followups.manage',
    'appointments.manage',
  ],
  DOCENTE_APOYO: [
    'dashboard.read',
    'students.read',
    'records.read.basic',
    'evaluations.read',
    'reports.read',
    'curricular_adaptations.manage',
    'followups.manage',
  ],
  DOCENTE: ['dashboard.read', 'students.read', 'records.read.basic', 'reports.read'],
  CONSULTA: ['dashboard.read', 'students.read', 'records.read.basic'],
}

/**
 * Traduce un valor externo -variable de entorno, cabecera, formulario- a un rol
 * conocido. Devuelve `null` cuando no lo reconoce, para que quien llama elija el
 * respaldo en vez de arrastrar un rol inexistente hasta `rolePermissions`.
 *
 * Tolera lo que suele llegar de un panel de despliegue: espacios sobrantes,
 * minúsculas y comillas pegadas al copiar el valor desde `.env.example`.
 */
export function parseRole(value: string | null | undefined): RoleCode | null {
  const normalized = value?.trim().replace(/^["']|["']$/g, '').toUpperCase()
  if (!normalized) return null
  return (roles as readonly string[]).includes(normalized) ? (normalized as RoleCode) : null
}

/**
 * Un rol desconocido no concede nada. Antes indexaba `rolePermissions` a ciegas
 * y un valor fuera del catálogo rompía el prerender con `undefined.includes`.
 */
export function can(role: RoleCode, permission: PermissionCode) {
  return rolePermissions[role]?.includes(permission) ?? false
}
