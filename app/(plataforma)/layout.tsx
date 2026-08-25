import './platform.css'

import type { ReactNode } from 'react'
import { AppShell } from '@/components/app-shell/app-shell'
import { getSession } from '@/lib/auth/session'
import { SessionProvider } from '@/lib/auth/session-context'

/**
 * Envoltura de toda la plataforma.
 *
 * La sesión se resuelve una sola vez, en el servidor, y baja al árbol de
 * cliente. El `div.dt` abre el ámbito visual claro: el layout raíz sigue
 * marcando tema oscuro para el landing y aquí no interfiere.
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const session = await getSession()

  return (
    <div className="dt">
      <SessionProvider session={session}>
        <AppShell>{children}</AppShell>
      </SessionProvider>
    </div>
  )
}
