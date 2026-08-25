'use client'

import type { ReactNode } from 'react'
import { MenuButton } from '@/components/app-shell/app-shell'
import { NotificationButton } from '@/components/app-shell/notification-button'
import { UserMenu } from '@/components/app-shell/user-menu'

/**
 * Barra superior de cada página. Sin buscador global: la única búsqueda del
 * producto es la del listado de evaluaciones, y vive en el listado.
 */
export function PageHeader({
  title,
  description,
  actions,
  above,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  above?: ReactNode
}) {
  return (
    <header className="dt-topbar">
      <MenuButton />
      <div className="dt-topbar-titles">
        {above}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="dt-topbar-actions">
        {actions}
        <NotificationButton />
        <span className="dt-topbar-divider" aria-hidden="true" />
        <UserMenu />
      </div>
    </header>
  )
}
