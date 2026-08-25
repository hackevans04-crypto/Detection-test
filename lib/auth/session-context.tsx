'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { AppSession } from '@/lib/auth/session'

const SessionContext = createContext<AppSession | null>(null)

/**
 * La sesión se resuelve en el servidor y baja al cliente por este proveedor.
 * Así el sidebar, el saludo del inicio y el `evaluatorId` de cada evaluación
 * leen exactamente el mismo profesional, sin que ningún componente lo invente.
 */
export function SessionProvider({ session, children }: { session: AppSession; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession debe usarse dentro de SessionProvider.')
  return session
}

/** Iniciales para los avatares. Devuelve cadena vacía si no hay nombre real. */
export function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
